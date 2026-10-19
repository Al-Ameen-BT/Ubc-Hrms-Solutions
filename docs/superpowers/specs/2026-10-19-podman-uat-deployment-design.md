# UCB HRMS — Podman UAT Deployment Design (Rocky Linux, Rootless)

Date: 2026-10-19
Status: FINAL — approved pending partner sign-off

## Intent & Why

The HRMS runs from a single `deploy.sh` onto a **Rocky Linux UAT server** as a
**rootless Podman** stack — no Hostinger anywhere, no docker-compose, no
seeding. The result is a reproducible, self-healing UAT environment: HTTPS at
the edge, MySQL restored from partner-provided `.sql` dumps, Redis wired into
the app's rate limiting, nightly DB backups in a container, and a deploy-time
proof that the container network is **the same network the stack used last
time** (no silent drift into a different subnet/IPs).

## Goals

1. One script (`deploy.sh`) that takes a fresh Rocky Linux box (or an
   already-running one) through staged, fail-fast deployment.
2. Rootless: all containers run under the deploy user; auto-restart on
   reboot/crash via **systemd user units (Quadlet)** + `loginctl enable-linger`.
3. Stable named Podman network `hrms-net` with **fixed subnet + static
   per-container IPs** and per-run drift verification.
4. Secrets (`JWT_SECRET`, DB passwords, Redis) auto-generated once, stored in
   a `0600` rootless-owned `.env`; never re-generated on re-deploys.
5. Data path: restore from a partner-supplied `mysqldump`-style `.sql`
   (schema + data), asked interactively. **No seeding scripts ever run.**
   `AUTO_MIGRATE=false` so Sequelize never alters the restored schema.
6. HTTPS at the edge with a self-generated self-signed cert; HTTP→HTTPS redirect.
7. Health + endpoint verification after every deploy, ending with a printed
   list of main links.
8. Hostinger fully removed from repo (docs, env examples, code comments).

## Non-goals / Anti-goals

- No Let's Encrypt / real CA automation (self-signed is agreed for UAT).
- No data seeding in this environment (`seed*` npm scripts are banned here;
  the script must never invoke them).
- No auto schema migration onto restored data (`AUTO_MIGRATE=false`).
- No rollback to docker-compose; compose file becomes Podman-native or is
  superseded by the script + Quadlets.

## Decisions (as made by the partner)

| # | Decision |
|---|----------|
| D1 | Redis is **integrated into the app**, not provision-only |
| D2 | Access is **HTTPS with a script-generated self-signed cert** |
| D3 | The `.sql` restore dump contains **schema + data** |
| D4 | deploy.sh **deploys what's on the server disk** (no git pull in the script) |
| D5 | UAT box has **outbound internet**; preflight verifies it and fails fast if not |
| D6 | `.env` carries **SETUP_TOKEN + ALLOW_PROD_SETUP**; deploy report prints the one-time super-admin bootstrap command as an escape hatch |

## Stack (rootless pod-level layout, bytecode: plain containers, not a pod)

All on user-defined network `hrms-net` (alias DNS + static IPs):

| Container | Image | Static IP | Aliases | Notes |
|-----------|-------|-----------|---------|-------|
| hrms-mysql | mysql:8.0 | 10.89.0.10 | db | data in `hrms-db-data` volume |
| hrms-backend | locally built (Containerfile) | 10.89.0.20 | backend | Express app, node dist statics kept as fallback |
| hrms-redis | redis:7-alpine | 10.89.0.30 | redis | appendonly off; UAT cache only |
| hrms-nginx | nginx:1.27-alpine | 10.89.0.40 | nginx | host ports 443 (TLS) + 80 → redirect; serves `frontend/dist` RO volume + proxies `/api` → backend |
| (backup) | throwaway per run: mysql:8.0 | any | backup | `hrms-backup.timer` (systemd user timer, nightly + `--backup-now` dumps to `hrms-backups` volume; keeps last 14) |

## Redis integration (app change)

- Add `ioredis` + `rate-limit-redis` deps.
- Replace the default in-memory stores of the four `express-rate-limit`
  limiters (global api, login, mfa, reset) in `src/server.js` with a shared
  Redis store keyed by IP (`keyPrefix: 'hrms:rl:'`).
- `REDIS_URL` from env (default `redis://10.89.0.30:6379`). If Redis is
  unreachable at boot, the app **logs a warning and falls back to the
  memory store** (UAT must not hard-crash on a cache outage).
- `/ready` probe additionally pings Redis once a store is configured
  (non-fatal degradation: reports `redis: degraded` but stays 200).

## Network & drift verification (the core ask)

- Install stage: create `hrms-net` **once** with static IPAM
  (`subnet 10.89.0.0/24, gateway 10.89.0.1`) via a Quadlet `.network` unit —
  Quadlet owns it and systemd keeps it present at boot.
- Every deploy writes `~/.local/state/ucb-hrms/network-baseline.json`:
  Network ID, Name, subnet/gateway, and each container's expected
  IP + MAC address.
- Drift check (every stage-6 run + post-restore):
  1. `podman network inspect hrms-net` — fails if missing; **NID changed →
     DRIFT (network was recreated)** → abort with a clear remediation message
     (`--recreate-network` opt-in to rebuild intentionally).
  2. Subnet/gateway mismatch → DRIFT → abort.
  3. `podman inspect` each container: `NetworkSettings`
     IP != assigned static IP → DRIFT → abort.
- Containers get `--ip 10.89.0.x` pinned so re-deploys can't move endpoints.

## Secrets handling

- Stage 4 generates, once, into `~/.config/ucb-hrms/.env` (`0600`):
  `JWT_SECRET` (≥64 hex chars, passes server.js production guard),
  `MYSQL_ROOT_PASSWORD`, `DB_USER`, `DB_PASSWORD`, `REDIS_URL`,
  `APP_BASE_URL`, `TLS_*` paths. Existing file → **kept** (never rotate
  silently), path printed.
- Compose only for docs: the canonical runtime env is this file; Quadlet
  units load it via `EnvironmentFile=`. `docker-compose.yml` is rewritten
  Podman-native or removed if redundant.

## deploy.sh stages (each prints PASS/FAIL, aborts on first FAIL)

0. Preflight — Rocky check (accept any Linux with dnf or confirm), current user is non-root, podman presence, ~15GB disk, ports 80/443 free.
1. Install — `dnf install -y podman`; `sysctl net.ipv4.ip_unprivileged_port_start=80` (persistent, needs sudo, skipped if already allowed); `loginctl enable-linger $USER`; SELinux noted (volumes get `:z`).
2. Install verification — podman `info` rootless check, network tools.
3. Secrets — generate/bootstrap `.env` (above).
4. Build — `podman build` backend image; copy `frontend/dist` into a shared volume for nginx.
5. Deploy — ensure `hrms-net` (Quadlet network), restore baseline check (drift), (re)create Quadlet units, `systemctl --user daemon-reload`, start in order: mysql, redis → backend → nginx.
6. Network drift verification — audits live network + container IPs vs baseline (never auto-deletes anything on mismatch).
7. DB restore — prompt for `.sql` path; stage it into a container-readable
   volume; **drop + recreate DB** (idempotent re-restores, builder's call:
   dump is schema+data via mysqldump); import via throwaway mysql container;
   set `AUTO_MIGRATE=false` and verify no `seed` usage; skip entirely if
   same dump already restored (state file hash, `--force-restore` to re-run).
8. Health & endpoint verification — `/healthz` (200), `/ready` (200 + DB + redis states), console loads over HTTPS (200), `/api` answers JSON; self-signed `-k` fetches.
9. Report — table PASS/FAIL per stage, **main links**: `https://<host>/`
   (console), `https://<host>/api`, health endpoints, backup commands.

## Hostinger removal checklist

- Delete `.env.hostinger.example`, `DEPLOY_HOSTINGER.md` (root + OldBuild).
- Scrub Hostinger/passenger/hPanel/wing mentions from README, PRODUCT.md,
  `src/server.js`, `src/config/db.js`, `.env.example`, sql schema comments.
- Replace compose file with Podman-native deployment docs (README section
  pointing at `deploy.sh`).

## Left to the builder (documented calls allowed)

- Exact stage exit codes/log file locations; `set -euo pipefail` style.
- State-file JSON schema details.
- Quadlet unit file names/paths (`~/.containers/systemd/` convention).
- Backup retention mechanics (keep last 14 by mtime).
- Redis fallback wording in `/ready`.
- nginx tuning (gzip/buffers) — keep minimal.
- **Restore robustness (builder calls from the check):**
  - Sanitize `DEFINER` clauses out of the dump before import; database is
    recreated as `ucb_hrms` regardless of the dump's original name; the app
    user is **created and granted full rights on `ucb_hrms` after restore**
    (a dump cannot be assumed to grant anyone).
  - Hostile leftover states (previous docker-compose stack, conflicting
    containers) → abort with clear remediation, never silently overlap.
  - `sudo` for sysctl/firewalld is attempted; on non-interactive failure the
    exact manual commands are printed and stages continue where safe.
- **Hostname:** script prompts once for the public hostname/IP (first
  deploy), stores it, uses it for the cert SAN **and** `APP_BASE_URL`
  (`set-hostname` override regenerates the cert deliberately).
- **Redis integration covers all five limiters** (login, mfa, reset, setup,
  api) — the earlier "four" was a miscount.
