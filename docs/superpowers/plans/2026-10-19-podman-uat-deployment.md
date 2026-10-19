# Podman UAT Deployment (Rocky Linux, Rootless) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One `deploy.sh` that deploys the HRMS stack (nginx TLS edge, backend, MySQL, Redis, systemd-timer backups) as rootless Podman containers on a Rocky Linux UAT server, with static-network drift verification and `.sql` dump restore — plus the app-side Redis integration and full Hostinger removal.

**Architecture:** All runtime state lives per-user under `~/.config/ucb-hrms/` (secrets `0600`, nginx conf, TLS certs, frontend dist). Containers are systemd **Quadlet** user units (auto-restart + linger) on one Quadlet-owned static-IP network `hrms-net` (`10.89.0.0/24`, gateway `10.89.0.1`; mysql `.10`, backend `.20`, redis `.30`, nginx `.40`). Every deploy records a network baseline (Network ID, subnet, container IPs) and aborts on any drift; DB content comes from a partner-provided schema+data `.sql` dump (never seeded).

**Tech Stack:** Bash (strict), rootless Quadlet/Podman, Rocky Linux (dnf/firewalld/selinux), nginx TLS, MySQL 8, Redis 7 via `ioredis` + `rate-limit-redis`, Express.

**Spec:** `docs/superpowers/specs/2026-10-19-podman-uat-deployment-design.md` (read alongside; it holds the approved decisions D1–D6).

## Global Constraints

- Everything rootless: deploy script must never need to run **as root**; root only via attempted-and-degradable `sudo` (sysctl, firewalld, linger) with manual-command fallback printing.
- UAT carries real restored data: `npm run seed`, `npm run seed:demo`, `npm run demo` must never be invoked by `deploy.sh` or Stage 7; `AUTO_MIGRATE=false` in the deployed `.env`.
- Network `hrms-net` static layout is frozen: subnet `10.89.0.0/24`, gateway `10.89.0.1`, mysql `10.89.0.10`, backend `10.89.0.20`, redis `10.89.0.30`, nginx `10.89.0.40`, aliases `db`/`backend`/`redis`/`nginx`.
- Secrets are generated **once** into `~/.config/ucb-hrms/.env` (`0600`) and preserved on re-deploy (never silently rotated).
- Drift = change in Network ID / subnet / container IP vs `~/.local/state/ucb-hrms/baseline.env` → hard abort with remediation text; deletion/recreation only via explicit `--recreate-network`.
- All volume mounts on Rocky need SELinux relabel (`:z` or `:Z`).
- `JWT_SECRET` must be ≥ 32 chars (use `openssl rand -hex 48`), else the production guard rejects boot.
- Bash files: `set -euo pipefail`, pass `bash -n` (and shellcheck if present).

## Review Focus

- **Redis unreachable at boot** → app must still boot and serve with in-memory limiter stores + degraded `/ready` (pinned in Task 1 Step 4: boot without redis, expect warning, `/ready` 200).
- **Network drift between deploys** → second-run network inspection must match baseline and any mismatch aborts (pinned in Task 4 Step 5: run inspect-compare logic against a mutated baseline and expect abort path text).
- **Second deploy must not regenerate secrets** → running the secrets stage twice keeps values byte-identical (pinned in Task 3 Step 5: hash `.env`, rerun, expect same hash).
- **Same dump restored twice** → hash in state file skips; `--force-restore` re-imports (pinned in Task 5 Step 5: hash logic unit-checked locally).
- **Seeding ban** → `grep -nE "npm run (seed|seed:demo|demo)" deploy.sh deploy/lib/*.sh` must return nothing (pinned in Task 5 Step 6).
- **No hardcoded secrets anywhere in the script** → `grep -nE "(JWT_SECRET|PASSWORD)=['\"]?[A-Za-z0-9!]" deploy.sh deploy/lib/*.sh deploy/quadlet/* must match only generation from openssl/variable use (pinned in Task 6 Step 6).

---

### Task 1: Redis integration in the backend (D1)

**Files:**
- Modify: `package.json` (dependencies)
- Create: `src/services/redis.js`
- Modify: `src/server.js` (limiter wiring + `/ready` enrichment)

**Interfaces:**
- Consumes: `process.env.REDIS_URL` (default `redis://10.89.0.30:6379`).
- Produces (all from `src/services/redis.js`):
  - `isRedisConfigured()` → bool (REDIS_ENABLED/REDIS_URL set)
  - `getRateStore()` → a `rate-limit-redis` RedisStore **or `null`** (never throws)
  - `probeRedis()` → `{ configured, ok, status }` for `/ready`
  - On connect failure: one-time `console.warn('[redis] unreachable — falling back to in-memory rate stores')`, then lazy client; retry on next timer tick (enableOfflineQueue false, maxRetriesPerRequest 1, lazyConnect).

- [x] **Step 1: Write failing boot/behavior check** (script `scripts/verify-redis-fallback.sh` or inline): start `NODE_ENV=development PORT=3101 REDIS_URL=redis://127.0.0.1:6399 node src/server.js`, assert stderr contains the fallback warning and `curl http://127.0.0.1:3101/ready` returns 200.
- [x] **Step 2: Run it, expect FAIL** (warn text/`/ready` redis block not present yet).
- [x] **Step 3: Implement** `src/services/redis.js` (spec above) and wire in `src/server.js`: all **five** limiters (`loginLimiter`, `mfaLimiter`, `resetLimiter`, `setupLimiter`, `apiLimiter`) use `store: getRateStore() || undefined`; `/ready` JSON gains `redis: probeRedis().status` — redis degradation must NOT flip the overall 200.
- [x] **Step 4: Run the check again: PASS**; also boot **with** a reachable local mock (skip gracefully if no redis binary: keep the no-redis PASS as the required gate).
- [x] **Step 5: `node --check src/server.js src/services/redis.js`; commit** `feat: redis-backed rate limiting with memory fallback`.

### Task 2: Hostinger purge (whole repo)

**Files:** Delete `.env.hostinger.example`, `DEPLOY_HOSTINGER.md`, `OldBuild/.env.hostinger.example`, `OldBuild/DEPLOY_HOSTINGER.md`; Modify: `README.md`, `PRODUCT.md`, `.env.example`, `src/server.js`, `src/config/db.js`, `src/scripts/dbInit.js`, `src/scripts/dbSync.js`, `src/models/employeeDocument.js`, `src/models/brandAsset.js`, `src/services/settings.js`, `src/sql/schema.sql`, `public/js/core.js`, `public/js/views-platform.js`, `public/js/components.js`, `.gitignore` (only where matched by grep).

- [x] **Step 1: Enumerate** every occurrence: `grep -rniE "hostinger|hpanel|passenger" . --exclude-dir=node_modules --exclude-dir=dist --exclude=package-lock.json` (record list).
- [x] **Step 2: Rewrite each hit**: doc sections → replaced by a short pointer to the UAT deployment section (README gets real content later in Task 7 — leave a placeholder line `<!-- deployment: see UAT Podman section -->`); code comments/strings → neutral wording ("Linux server"); `.env.example` Hostinger header → generic MySQL/Linux wording.
- [x] **Step 3: Verify zero**: same grep command returns no matches anywhere (including OldBuild, excluding node_modules/dist/package-lock).
- [x] **Step 4: Commit** `chore: remove all Hostinger deployment references`.

### Task 3: deploy.sh skeleton — common lib + Stages 0–3 (preflight, install, verify-install, secrets)

**Files:**
- Create: `deploy.sh` (entrypoint, stage dispatcher, subcommands `--stage N|name`, `--recreate-network`, `--force-restore`, `--backup-now`, `set-hostname <host>`, `status`; ends with Stage 9 report)
- Create: `deploy/lib/common.sh` (log helpers `stage_head/pas/fail`, `load_baseline`, `write_baseline`, `read_state`/`update_state` flat `KEY=VALUE` file under `~/.local/state/ucb-hrms/`, `config_dir=~/.config/ucb-hrms`, `q(){ ... }` quoting helpers)
- Create: stage funcs in `deploy.sh`: `stage0_preflight` (non-root, Rocky-or-confirm, podman present or continue-to-stage1, ~15 GB free, egress check `curl -fsSL https://registry-1.docker.io/v2/ -o /dev/null`, ports 80/443-or-8080/8443 free, none of `hrms-*` containers alive, **no old docker-compose stack** with `container_name ucb-hrms-app|ucb-hrms-mysql` detected), `stage1_install` (attempts `sudo dnf install -y podman`, `sudo sysctl net.ipv4.ip_unprivileged_port_start=80` + echo persistence line, `sudo loginctl enable-linger $USER`; on sudo failure print manual block and continue), `stage2_verify_install` (`podman info --format {{.Host.Security.Rootless}}` == true, `podman --version`), `stage3_secrets` (create config dir if missing; if `.env` missing: prompt public host (`set-hostname`/state `PUBLIC_HOST`), generate `JWT_SECRET=$(openssl rand -hex 48)`, `DB_USER=hrms_uat`, `DB_PASSWORD`/`MYSQL_ROOT_PASSWORD` (`openssl rand -hex 16`), `SETUP_TOKEN=$(openssl rand -hex 24)`, `ALLOW_PROD_SETUP=true`, `AUTO_MIGRATE=false`, `NODE_ENV=production`, `REDIS_URL=redis://10.89.0.30:6379`, `APP_BASE_URL`, TLS vars, `chmod 600`; if exists: keep, print path)

**Interfaces:**
- Produces for later tasks: `.env` at `~/.config/ucb-hrms/.env`; baseline/state helpers; `PUBLIC_HOST` state var; `PORT_PREFIX=(443 80)` or `(8443 8080)` exported as `TLS_PORT`/`HTTP_PORT`.
- Consumes: repo-local `docker-compose.yml` may still exist (Task 7 deletes it) — stage 0 only *detects and aborts* on a running old stack.

- [x] **Step 1: Write `deploy/lib/common.sh` + `deploy.sh` scaffold** with the four stage functions and the strict-mode dispatcher (each stage: `stage_head N name; f; pas`).
- [x] **Step 2: Static verification**: `bash -n deploy.sh deploy/lib/common.sh`; `shellcheck` if available.
- [x] **Step 3: Secrets-idempotence check** (Clip): run `bash -c 'source deploy/lib/common.sh; stage3_secrets'` twice locally (no podman needed at this stage); `md5sum` of `.env` identical both times.
- [x] **Step 4: Commit** `feat: deploy.sh stages 0-3 (preflight, install, secrets)`.

### Task 4: Quadlet units, nginx assets, stages 4–6 (build, deploy, drift verify)

**Files:**
- Create: `deploy/quadlet/hrms-net.network` (Driver=bridge, Subnet=10.89.0.0/24, Gateway=10.89.0.1, Quadlet privileges)
- Create: `deploy/quadlet/hrms-mysql.container` (Image=mysql:8.0, Network=hrms-net, PodmanArgs=--ip=10.89.0.10 --hostname=mysql --network-alias=db, Volume=%{h}:? exact: `hrms-db-data:/var/lib/mysql:Z`, EnvFile=%h/.config/ucb-hrms/.env, env lines MYSQL_ROOT_PASSWORD=${...} — note: Quadlet supports `%o`? NO — values must come from EnvironmentFile and MYSQL_* need literal env in unit via Environment= lines referencing the loaded file: use `EnvironmentFile=` + `Environment=MYSQL_DATABASE=ucb_hrms`; secrets read by entrypoint from under a `docker-entrypoint` normal flow; healthcheck cmd mysqladmin ping)
- Create: `deploy/quadlet/hrms-redis.container` (Image=redis:7-alpine, Network=hrms-net, --ip=10.89.0.30, --network-alias=redis, healthcheck redis-cli ping)
- Create: `deploy/quadlet/hrms-backend.container` (Image=localhost/hrms-backend:latest, Network=hrms-net, --ip=10.89.0.20, --network-alias=backend, EnvFile=%h/.config/ucb-hrms/.env (DB_HOST=10.89.0.10, app reads env), PublishPort only if direct debug mode; HealthCmd=wget -qO- http://localhost:3000/healthz)
- Create: `deploy/quadlet/hrms-nginx.container` (Image=nginx:1.27-alpine, Network=hrms-net, --ip=10.89.0.40, PublishPort=80:80 and 443:443 (or fallback ports), Volume `hrms-page:/usr/share/nginx/html:ro`, volume `%h/.config/ucb-hrms/nginx:/etc/nginx/conf.d:Z`, `%h/.config/ucb-hrms/tls:/etc/nginx/tls:Z`)
- Create: `deploy/nginx/uat.conf` (TLS server with cert from /etc/nginx/tls, HTTP→HTTPS redirect, root static, `location /api { proxy_pass http://10.89.0.20:3000; }`, client max body sized for document uploads e.g. 50m)
- Modify: `deploy.sh` — `stage4_build` (`podman build -t localhost/hrms-backend:latest .`; dist copy-out: `c=$(podman create --rm true img)`… `podman cp "$c":/usr/src/app/frontend/dist/. ~/.config/ucb-hrms/frontend-dist/` … `podman rm`; build nginx conf+certs: self-signed `openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes -subj "/CN=$PUBLIC_HOST" -addext "subjectAltName=DNS:$PUBLIC_HOST,IP:$(resolve)"`), `stage5_deploy` (ensure Quadlet files installed to `~/.containers/systemd/` with `%h`-expanded config, `systemctl --user daemon-reload`, explicit ordering: db → redis → backend → nginx), `stage6_drift_check` (`podman network inspect hrms-net` via `--format json`: NetworkID vs baseline, subnet/gateway vs `10.89.0.0/24`; per-container `podman inspect --format {{.NetworkSettings.Networks.hrms-net.IPAddress}}` vs pinned; **any mismatch → DRIFT abort with remediation (`deploy.sh --recreate-network`)**; `--recreate-network` path: stop all units, `podman network rm`, reinstall `.network` unit, rewrite baseline)
- **Baseline write** (`write_baseline`) records NetworkID/subnet + live container IPs right after Stage 5.

**Interfaces:**
- Consumes: Task 3 helpers; backend image name `localhost/hrms-backend:latest` consumed by Task 4 units only.
- Produces: baseline file `~/.local/state/ucb-hrms/baseline.env` (`NETWORK_ID`, `SUBNET`, `GATEWAY`, `IP_MYSQL/…`).

- [x] **Step 1: Write all unit/nginx files + stage functions.** Quadlet notes: `.container` units take `EnvironmentFile=%h/.config/ucb-hrms/.env`; static IPs/aliases go through `PodmanArgs=` lines, so any line that embeds a secret-valued variable must be generated with its final value at unit-install time by `stage5_deploy` (never interpolated inside the unit file itself).
- [x] **Step 2: `bash -n`; `shellcheck`; structural check:** `grep -c "10.89.0." deploy/quadlet/*` and assert each unit pins its exact IP; assert `Network=hrms-net` appears in all `.container` units.
- [x] **Step 3: Drift-logic unit check (no podman needed):** source `stage6` helpers with canned `podman network inspect` fixture via a `PODMAN_DRYRUN_DIR` test hook; mutate baseline (wrong NetworkID) and expect the abort message.
- [x] **Step 4: Commit** `feat: quadlet stack, nginx edge, stages 4-6 with drift verification`.

### Task 5: Stage 7 restore + Stage 8 backup assets

**Files:**
- Modify: `deploy.sh` — `stage7_restore`, `stage8_backup_assets` (rename: health endpoints move to stage 8 verify in Task 6; backup assets build here)
- Create: `deploy/quadlet/hrms-backup.service` + `hrms-backup.timer` (`OnCalendar=*-*-* 01:05:00`, `Type=oneshot`; ExecStart spawns a throwaway podman container from mysql:8.0 on hrms-net with `--env-file %h/.config/ucb-hrms/.env` and volume `hrms-backups:/backups:Z`, running `mysqldump -h10.89.0.10 -uroot --single-transaction ucb_hrms`, gzipped to `/backups/ucb_hrms-<UTC timestamp>.sql.gz`, pruning to the 14 most recent dumps)

**Restore internals (specified):**
- Prompt path (`read -r SQL_FILE`; validate file is readable, non-empty, looks like SQL: first bytes contain `INSERT`/`CREATE`; compute `sha256` and store in state as `DUMP_HASH` — identical hash + success flag ⇒ skip unless `--force-restore`).
- Copy to volume dir `%h/.config/ucb-hrms/import/` with `chmod o+r` for rootless-mapped access.
- Sanitize: `sed -E 's/DEFINER[[:space:]]*=[[:space:]]*`[^`]+`@`[^`]+`//g'` → `import.sql`; neutralize any dump-side `CREATE DATABASE`/`USE` lines so nothing can land in a foreign name — the target `ucb_hrms` is dropped + recreated by the importer before the dump body runs.
- Import (throwaway container): `podman run --rm --network hrms-net --ip=10.89.0.15 -v import:Z mysql:8.0 bash -c 'mysql -h10.89.0.10 -uroot -p$MYSQL_ROOT_PASSWORD -e "DROP DATABASE IF EXISTS ucb_hrms; CREATE DATABASE ucb_hrms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" && mysql -h... -u... ucb_hrms < /import/import.sql'` (DB name never taken from dump).
- Post-restore **grants**: `CREATE USER IF NOT EXISTS 'hrms_uat'@'%' IDENTIFIED BY '$DB_PASSWORD'; GRANT ALL ON ucb_hrms.* TO 'hrms_uat'@'%' FLUSH PRIVILEGES;`
- Verify: `SELECT COUNT(*) FROM information_schema.tables WHERE TABLE_SCHEMA='ucb_hrms';` ≥ 1 else FAIL stage.
- **Ban check** pinned here:
- [x] **Step 1: implement stage7 + stage8(units+timer).**
- [x] **Step 2: `bash -n`.**
- [x] **Step 3: hash-skip check with a fake 3-line dump + stubbed import** (local function defined via `PODMAN="echo"` mode): first run executes import cmd; second run (same hash) prints "dump already restored" and respects skip; `--force-restore` re-executes.
- [x] **Step 4: seeding ban check:** the grep must return **0 lines** in deploy.sh + deploy/lib + deploy/quadlet (.Repositories: npm run seed|seed:demo|demo) — expected zero matches **is the pass**.
- [x] **Step 5: Commit** `feat: .sql restore stage (no seeding, DEFINER-safe, grant-fixing) + systemd backup timer`.

### Task 6: Stage 8 health verification, Stage 9 report, `status` subcommand

**Files:**
- Modify: `deploy.sh` — `stage8_health` (with base `https://$PUBLIC_HOST:$TLS_PORT`, `curl -kfsS` checks: `/healthz` → 200; `/ready` → 200 + JSON contains `redis` key; `/` → 200 contains expected app title string; `/api` returns callable JSON — assert 200 only), `stage9_report` (STATE table from stages; **main links** block: console URL, API URL, health/readiness URLs; **bootstrap escape hatch**: printed `SETUP_TOKEN`-based `curl` for `/admin/setup/bootstrap-super-admin` with ⚠ remove-token warning), `status` (idle view: units' `systemctl --user is-active`, container states, latest backup file), `--backup-now` (invokes the same oneshot command the timer unit uses).
- [x] **Step 1: implement.**
- [x] **Step 2: `bash -n`; shellcheck (if present); flag-parsing check:** `bash deploy.sh status --help` prints usage without starting anything in a dry environment (stubs).
- [x] **Step 3: hardcoded-secrets check (Review Focus):** the `grep` for literal password/jwt assignments must only match generation lines (`$(openssl rand -hex …)`) — no fixed values.
- [x] **Step 4: Commit** `feat: health verification, deploy report with links, status subcommand`.

### Task 7: Repo wrap-up — README UAT section, remove docker-compose.yml, commit & push

**Files:**
- Modify: `README.md` (UAT Podman section: requirements Rocky 9, scp/rsync checkout to server, `./deploy.sh` first run (prompts), redeploys, links list meaning, backup (`--backup-now`, timer cadence, restore-from-backup command), drift/`--recreate-network`, secret rotation manual procedure, `status`).
- Delete: `docker-compose.yml` (superseded by Quadlets).
- Modify: `.env.example` — add `REDIS_URL`, remove staging-only leftovers, note that UAT secrets are script-generated (never copy-paste).
- [x] **Step 1: write section (concise, matches script's real flags).**
- [x] **Step 2: `grep -ri hostinger` still zero; `grep -rn "docker compose" README.md` zero.**
- [x] **Step 3: Commit** `docs: UAT Podman deployment guide; drop compose file`, **push** `git push origin main`.

---

## Verification of the whole plan (post-execution)

- `bash -n deploy.sh deploy/lib/common.sh` clean; `shellcheck deploy.sh` clean or zero-error on Rocky target.
- `grep -ri hostinger` → 0 hits (excluding node_modules/dist/package-lock).
- Seeding grep (Task 5 Step 4) → 0 hits.
- `node --check` on all touched js; Redis fallback boot check passes locally (no Redis needed).
- Secrets reproducibility, dump-hash skip, drift-abort fixture tests all PASS locally.
