#!/usr/bin/env bash
# deploy.sh — UCB HRMS Podman UAT deployment script (rootless)
#
# The script autodetects the OS from /etc/os-release and adapts: the distro
# decides the package manager used to install podman (dnf for Rocky/RHEL/
# CentOS/Fedora, apt-get for Ubuntu/Debian, zypper/pacman/apk as mapped),
# and stage 2 refuses podman builds without Quadlet support (< 4.4).
# Primary target: Rocky Linux 9. Also fine on Ubuntu 24.04+ / Debian 12.
#
# Usage:
#   ./deploy.sh                     # run all stages 0-9
#   ./deploy.sh --stage 4           # run a single stage
#   ./deploy.sh --recreate-network  # intentionally rebuild hrms-net (drift remediation)
#   ./deploy.sh --force-restore     # re-import the .sql dump even if hash matches
#   ./deploy.sh --backup-now        # run one DB backup immediately
#   ./deploy.sh status              # show current deployment status
#   ./deploy.sh set-hostname <host> # change the public hostname (regenerates TLS cert)
#
# Rootless Podman stack on hrms-net (static subnet 10.89.0.0/24):
#   mysql 10.89.0.10 | backend 10.89.0.20 | redis 10.89.0.30 | nginx 10.89.0.40
# Auto-restart via systemd user units (Quadlet) + loginctl enable-linger.

set -euo pipefail

# ── Load shared library ────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/common.sh
source "${SCRIPT_DIR}/deploy/lib/common.sh"

# ── Global constants (frozen network layout) ───────────────────────────────
readonly NET_NAME="hrms-net"
readonly NET_SUBNET="10.89.0.0/24"
readonly NET_GATEWAY="10.89.0.1"
readonly IP_MYSQL="10.89.0.10"
readonly IP_BACKEND="10.89.0.20"
readonly IP_REDIS="10.89.0.30"
readonly IP_NGINX="10.89.0.40"
readonly IMAGE_BACKEND="localhost/hrms-backend:latest"
readonly DB_NAME="ucb_hrms"
readonly QUADLET_DIR="$HOME/.config/containers/systemd"
readonly SYSTEMD_USER_DIR="$HOME/.config/systemd/user"

# CLI-flag state
STAGE="all"
RECREATE_NETWORK=0
FORCE_RESTORE=0
BACKUP_NOW=0

# Runtime config defaults (filled from .env / state)
PUBLIC_HOST="" TLS_PORT="443" HTTP_PORT="80"

# ── CLI parsing (subcommands dispatched AFTER function definitions) ────────
SUBCMD="" SUBCMD_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --stage|-s)
      [[ $# -ge 2 ]] || { echo "usage: $0 --stage <0-9|all>" >&2; exit 1; }
      STAGE="$2"; shift 2 ;;
    --recreate-network) RECREATE_NETWORK=1; shift ;;
    --force-restore)   FORCE_RESTORE=1; shift ;;
    --backup-now)      BACKUP_NOW=1; shift ;;
    status)            SUBCMD="status"; shift ;;
    set-hostname)
      [[ $# -ge 2 ]] || { echo "usage: $0 set-hostname <host>" >&2; exit 1; }
      SUBCMD="set-hostname"; SUBCMD_ARG="$2"; shift 2 ;;
    --help|-h)
      sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 1 ;;
  esac
done

# ── Config loading: read state FILE per-key (never source it into this
# shell and never source the secrets .env — avoids readonly-variable
# collisions; secrets are read per-key via get_env when needed).
load_config() {
  PUBLIC_HOST="${PUBLIC_HOST:-$(read_state PUBLIC_HOST)}"
  OS_ID="${OS_ID:-$(read_state OS_ID)}"
  OS_PKG_MGR="${OS_PKG_MGR:-$(read_state OS_PKG_MGR)}"
  # Re-detect live OS if state is empty (or drifted) — keeps per-stage runs
  # working even after someone deletes the state dir.
  if [[ -z "$OS_ID" || -z "$OS_PKG_MGR" ]]; then
    detect_os || true
    update_state OS_ID "$OS_ID"
    update_state OS_PKG_MGR "$OS_PKG_MGR"
  fi
  # Ports: honour a saved choice only while both ports are free, otherwise
  # re-pick (80/443 preferred, 8080/8443 fallback). Persisted so every
  # stage — and later single-stage runs — publishes and checks the SAME
  # ports the stack was actually started with.
  pick_ports || stage_fail "no free port pair — 80+443 and 8080+8443 are all in use (ss -ltn)"
  update_state TLS_PORT "$TLS_PORT"
  update_state HTTP_PORT "$HTTP_PORT"
}

# ── Port helpers ───────────────────────────────────────────────────────────
# True when no TCP listener occupies the port. Uses `ss` on purpose: the
# old `lsof -ti` check silently returned nothing for sockets owned by
# other users (e.g. host nginx holding 80/443), so preflight passed while
# the nginx container could not bind.
port_free() {
  local out
  out="$(ss -H -ltn "sport = :$1" 2>/dev/null || true)"
  [[ -z "$out" ]]
}

# Choose the HTTP/TLS port pair the stack will publish. Order:
#   1. saved state pair, while both ports are still free (stable choice)
#   2. 80/443 — when unprivileged binding allows it and both are free
#   3. 8080/8443 fallback
# Fails (return 1) when no pair is available.
pick_ports() {
  local st_tls st_http
  st_tls="$(read_state TLS_PORT)"
  st_http="$(read_state HTTP_PORT)"
  if [[ -n "$st_tls" && -n "$st_http" ]]; then
    # A running hrms-nginx legitimately holds the saved pair during a
    # redeploy — its own listeners must not be mistaken for a foreign
    # conflict (that check used to abort every re-run of stage 5+).
    if systemctl --user is-active --quiet hrms-nginx 2>/dev/null \
       || { port_free "$st_http" && port_free "$st_tls"; }; then
      HTTP_PORT="$st_http"; TLS_PORT="$st_tls"; return 0
    fi
  fi
  local low_ok=0
  if [[ "$(sysctl -n net.ipv4.ip_unprivileged_port_start 2>/dev/null || echo 1024)" -le 80 ]]; then
    low_ok=1
  fi
  if (( low_ok )) && port_free 80 && port_free 443; then
    HTTP_PORT=80; TLS_PORT=443; return 0
  fi
  if port_free 8080 && port_free 8443; then
    HTTP_PORT=8080; TLS_PORT=8443; return 0
  fi
  return 1
}

# Resolve the container a Quadlet unit actually created. Podman names
# them "systemd-<unit>" on some builds (4.9 here) and "<unit>" on others,
# so match on the PODMAN_SYSTEMD_UNIT label instead of hardcoding either.
unit_container() {
  podman ps -a --filter "label=PODMAN_SYSTEMD_UNIT=$1.service" \
    --format '{{.Names}}' 2>/dev/null | head -1
}

# ── Set / change the public hostname (regenerates TLS cert on purpose) ─────
set_hostname() {
  local host="$1"
  [[ -n "$host" ]] || { echo "usage: $0 set-hostname <host-or-ip>"; exit 1; }
  update_state PUBLIC_HOST "$host"
  update_state TLS_CERT_GENERATED ""   # force cert regeneration next deploy
  echo "hostname set to '$host' — TLS cert will be regenerated on next deploy"
}

# ════════════════════════════════════════════════════════════════════════════
# STAGE 0 — Preflight
# ════════════════════════════════════════════════════════════════════════════
stage0_preflight() {
  stage_head 0 "preflight"

  [[ "$(id -u)" -ne 0 ]] || stage_fail "run as a regular user (rootless podman), not root"

  # Detect the OS and adapt: the distro decides the package manager and
  # commands used in stages 1–4; anything unmanaged needs a confirm.
  detect_os || true
  if [[ "$OS_PKG_MGR" != "unknown" ]]; then
    echo "detected OS: ${OS_NAME:-$OS_ID} (id: ${OS_ID}${OS_VERSION:+ $OS_VERSION}) → pkg manager: ${OS_PKG_MGR}"
  else
    echo "WARNING: could not map '${OS_NAME:-$OS_ID}' to a known package manager."
    read -r -p "This OS is not on the supported list (dnf/apt/zypper/pacman/apk) — deploy anyway? [y/N] " yn
    [[ "$yn" == "y" || "$yn" == "Y" ]] || stage_fail "aborted: unsupported OS '$OS_ID'"
  fi
  update_state OS_ID "$OS_ID"
  update_state OS_PKG_MGR "$OS_PKG_MGR"

  local free_gb
  free_gb="$(df -BG "$HOME" | awk 'NR==2{print $4}' | tr -d 'G')"
  (( ${free_gb%%G} >= 15 )) || stage_fail "need ≥15 GB free disk, found ${free_gb}G"

  # Egress: docker registry reachable. Note: /v2/ answers 401 when
  # unauthenticated — that is normal and PROVES reachability, so any HTTP
  # response passes; only transport errors (DNS/refused/timeout) fail.
  curl -sS --max-time 10 -o /dev/null https://registry-1.docker.io/v2/ \
    || stage_fail "no outbound internet (docker.io unreachable)"

  # Ports: pick the pair the stack will publish (state → 80/443 → 8080/8443).
  # Fails loudly when nothing is free — the previous lsof-based check could
  # not see other users' listeners and passed while host nginx held 80/443.
  pick_ports || stage_fail "no free port pair — need 80+443 or 8080+8443 free (ss -ltn)"
  echo "ports: http=${HTTP_PORT} tls=${TLS_PORT}"

  # Old docker-compose stack detection (aborts, never silently overlaps)
  if podman ps --format '{{.Names}}' 2>/dev/null | grep -qE '^ucb-hrms-(app|mysql)$'; then
    stage_fail "old compose stack (ucb-hrms-app/mysql) is running — tear it down first: podman stop ucb-hrms-app ucb-hrms-mysql && podman rm ucb-hrms-app ucb-hrms-mysql"
  fi

  # Stale containers from a half-finished previous run — but only when
  # their systemd unit is NOT running: a live stack is just a normal
  # redeploy (stage 5 restarts the units).
  if command -v systemctl &>/dev/null; then
    local c
    for c in hrms-mysql hrms-redis hrms-backend hrms-nginx; do
      # Match by unit label — the container may be named "systemd-<unit>".
      if [[ -n "$(unit_container "$c")" ]] \
         && ! systemctl --user is-active --quiet "$c" 2>/dev/null; then
        stage_fail "stale container $c exists but unit '$c' is inactive — resolve first (systemctl --user status $c, or ./deploy.sh --stage 5)"
      fi
    done
  else
    # no systemd session available — fall back to name-only detection
    if podman ps -a --format '{{.Names}}' 2>/dev/null | grep -qE '^(systemd-)?hrms-(mysql|redis|backend|nginx)$'; then
      stage_fail "hrms-* containers exist but no systemd session to manage them — remove manually if stale"
    fi
  fi

  stage_pas
}

# ════════════════════════════════════════════════════════════════════════════
# STAGE 1 — Install
# ════════════════════════════════════════════════════════════════════════════
stage1_install() {
  stage_head 1 "install prerequisites"

  # Podman (rootless) — installed with the package manager stage 0 detected
  if ! command -v podman &>/dev/null; then
    if ! pkg_install_podman 2>/dev/null; then
      # sudo failed (no TTY password, missing sudo, wrong pkg mgr): say how
      echo "MANUAL: install podman (e.g. as root: pkg_install_podman equivalent for ${OS_PKG_MGR:-your distro})"
      stage_fail "podman missing and automatic install failed"
    fi
  fi

  # Allow rootless binding of low ports (needed for nginx 80/443)
  local cur
  cur="$(sysctl -n net.ipv4.ip_unprivileged_port_start 2>/dev/null || echo 1024)"
  if [[ "$cur" -gt 80 ]]; then
    if sudo -n sysctl net.ipv4.ip_unprivileged_port_start=80 2>/dev/null; then
      sudo -n bash -c 'echo "net.ipv4.ip_unprivileged_port_start=80" > /etc/sysctl.d/99-ucb-hrms-rootless-ports.conf' 2>/dev/null || true
    else
      echo "NOTE: sudo unavailable for sysctl — low ports may stay restricted."
      echo "MANUAL (as root, to use 80/443):"
      echo "  sysctl net.ipv4.ip_unprivileged_port_start=80"
      echo "  echo 'net.ipv4.ip_unprivileged_port_start=80' > /etc/sysctl.d/99-ucb-hrms-rootless-ports.conf"
    fi
  fi
  # Decide the pair for real: low ports allowed AND free → 80/443,
  # otherwise 8080/8443 (never assume 80/443 just because binding is
  # permitted — something else may already listen there).
  pick_ports || stage_fail "no free port pair — need 80+443 or 8080+8443 free (ss -ltn)"
  update_state TLS_PORT "$TLS_PORT"; update_state HTTP_PORT "$HTTP_PORT"
  echo "ports: http=${HTTP_PORT} tls=${TLS_PORT}"

  # Linger: units survive reboot
  if ! loginctl show-user "$USER" -p Linger 2>/dev/null | grep -q yes; then
    sudo -n loginctl enable-linger "$USER" 2>/dev/null \
      || echo "MANUAL (as root): loginctl enable-linger $USER"
  fi

  stage_pas
}

# ════════════════════════════════════════════════════════════════════════════
# STAGE 2 — Verify install
# ════════════════════════════════════════════════════════════════════════════
stage2_verify_install() {
  stage_head 2 "verify install"

  local info
  info="$(podman info --format '{{.Host.Security.Rootless}}' 2>/dev/null)" \
    || stage_fail "podman not usable"
  [[ "$info" == "true" ]] || stage_fail "podman is running rootful — must be rootless"

  # podman version must support Quadlet (user-level systemd integration).
  local ver
  ver="$(podman --version 2>/dev/null | awk '{print $3}')"
  if [[ -z "$ver" ]]; then
    stage_fail "could not read the podman version"
  elif ! version_ge "$ver" "$PODMAN_MIN"; then
    stage_fail "podman $ver is too old for Quadlet units (need ≥ ${PODMAN_MIN}). On Ubuntu 22.04 LTS: upgrade to 24.04 or install a newer podman from its upstream repo, then re-run."
  fi
  echo "podman: $ver (Quadlet-capable) on $OS_ID"

  # Rootless mapping readiness: the deploy user needs a subordinate-UID
  # range. Fresh installs get one automatically; users created before the
  # podman install often don't.
  if ! grep -q "^${USER}:" /etc/subuid 2>/dev/null; then
    if sudo -n usermod --add-subuids 100000-165535 --add-subgids 100000-165535 "$USER" 2>/dev/null; then
      echo "added subordinate UID/GID range for $USER"
    else
      echo "MANUAL (as root, required for rootless containers):"
      echo "  usermod --add-subuids 100000-165535 --add-subgids 100000-165535 $USER"
      stage_fail "$USER has no /etc/subuid entry — rootless podman cannot map UIDs"
    fi
  fi

  [[ "$TLS_PORT" == "443" ]] && echo "ports: 80/443 (unprivileged ports OK)" \
                             || echo "ports: ${HTTP_PORT}/${TLS_PORT} (fallback)"

  # Systemd user session available for Quadlet
  systemctl --user daemon-reload &>/dev/null \
    || stage_fail "systemd --user session unavailable (needed for Quadlet auto-restart)"

  stage_pas
}

# ════════════════════════════════════════════════════════════════════════════
# STAGE 3 — Secrets (idempotent: generate once, never rotate silently)
# ════════════════════════════════════════════════════════════════════════════
stage3_secrets() {
  stage_head 3 "secrets"

  if [[ -f "$CONFIG_DIR/.env" ]]; then
    echo "existing .env kept: $CONFIG_DIR/.env (never regenerated silently)"
    stage_pas
    return 0
  fi

  if [[ -z "${PUBLIC_HOST:-}" ]]; then
    read -r -p "Public hostname or IP for UAT access (e.g. 203.0.113.42 or uat.banihal.in): " PUBLIC_HOST
    [[ -n "$PUBLIC_HOST" ]] || stage_fail "hostname required (TLS SAN + APP_BASE_URL)"
  fi
  update_state PUBLIC_HOST "$PUBLIC_HOST"

  mkdir -p "$CONFIG_DIR"
  # Non-443 fallback (host nginx holds 443) must carry the port in
  # APP_BASE_URL — links built from it (emails, invite, /o/<CODE>) otherwise
  # hit the wrong service on 443.
  local base_url="https://${PUBLIC_HOST}"
  [[ "$TLS_PORT" == "443" ]] || base_url="https://${PUBLIC_HOST}:${TLS_PORT}"
  cat > "$CONFIG_DIR/.env" <<ENV
# UCB-HRMS UAT runtime secrets — generated by deploy.sh $(date -Is)
# Keep this file; re-deploys reuse it. Rotate by hand only.
JWT_SECRET=$(openssl rand -hex 48)
JWT_EXPIRY=12h
DB_DIALECT=mysql
DB_HOST=${IP_MYSQL}
DB_PORT=3306
DB_NAME=${DB_NAME}
DB_USER=hrms_uat
DB_PASSWORD=$(openssl rand -hex 16)
MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)
NODE_ENV=production
PORT=3000
REDIS_URL=redis://${IP_REDIS}:6379
# Links (emails, invite, /o/<CODE>) must carry the published port when the
# stack fell back to 8080/8443 (host nginx holds 80/443) — omitting it made
# every generated link hit the wrong service on 443.
APP_BASE_URL=${base_url}
SETUP_TOKEN=$(openssl rand -hex 24)
ALLOW_PROD_SETUP=true
# Additive-only schema upgrade on boot (sequelize.sync() + migrate()).
# The UAT dump predates later slices (custom_domain etc.) — with this off,
# every Organization query 500s with "Unknown column". Never drops/alters.
AUTO_MIGRATE=true
ENV
  chmod 600 "$CONFIG_DIR/.env"
  stage_pas "generated $CONFIG_DIR/.env (0600)"
}

# ════════════════════════════════════════════════════════════════════════════
# STAGE 4 — Build (backend image + frontend dist + TLS cert)
# ════════════════════════════════════════════════════════════════════════════
stage4_build() {
  stage_head 4 "build"

  podman build -t "$IMAGE_BACKEND" . \
    || stage_fail "image build failed"

  # Copy frontend/dist out of the image for nginx (static hosting at the edge)
  local cp_err
  podman rm -f hrms-dist-extract >/dev/null 2>&1 || true   # stale from an aborted run
  if ! cp_err="$(podman create --name hrms-dist-extract "$IMAGE_BACKEND" true 2>&1)"; then
    stage_fail "could not create the dist-extract container: $cp_err"
  fi
  mkdir -p "$CONFIG_DIR/frontend-dist"
  if ! podman cp hrms-dist-extract:/app/frontend/dist/. "$CONFIG_DIR/frontend-dist/" 2>/dev/null; then
    podman rm -f hrms-dist-extract >/dev/null 2>&1 || true
    stage_fail "frontend/dist missing from the built image — did the frontend build run in the Containerfile?"
  fi
  podman rm -f hrms-dist-extract >/dev/null 2>&1 || true
  [[ -f "$CONFIG_DIR/frontend-dist/index.html" ]] || stage_fail "frontend/dist not copied (index.html absent)"

  # TLS cert (self-signed, SAN-matched to the public host). openssl rejects
  # IP:<value> unless it's actually an IP — so emit the matching form only.
  local certdir="$CONFIG_DIR/tls"
  mkdir -p "$certdir"
  if [[ ! -f "$certdir/server.crt" || "$(read_state TLS_CERT_HOST 2>/dev/null)" != "$PUBLIC_HOST" ]]; then
    echo "generating self-signed cert for $PUBLIC_HOST"
    local san
    if [[ "$PUBLIC_HOST" =~ ^[0-9]+([.][0-9]+){3}$ ]]; then
      san="IP:${PUBLIC_HOST}"
    else
      san="DNS:${PUBLIC_HOST}"
    fi
    openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes \
      -keyout "$certdir/server.key" -out "$certdir/server.crt" \
      -subj "/CN=${PUBLIC_HOST}" \
      -addext "subjectAltName=${san}" 2>/dev/null \
      || stage_fail "openssl cert generation failed"
    chmod 600 "$certdir/server.key"; chmod 644 "$certdir/server.crt"
    update_state TLS_CERT_HOST "$PUBLIC_HOST"
  fi

  stage_pas
}

# ════════════════════════════════════════════════════════════════════════════
# STAGE 5 — Deploy (network + quadlet units + start order)
# ════════════════════════════════════════════════════════════════════════════
stage5_deploy() {
  stage_head 5 "deploy"

  install_quadlets
  systemctl --user daemon-reload

  # Start order: db, redis → backend → nginx. No `systemctl enable` here:
  # Quadlet units are GENERATED units (enable fails with "transient or
  # generated") and the generator already links them into
  # default.target.wants, so boot enablement is automatic — the previous
  # enable line always failed and aborted --stage 5 runs outright.
  # `restart` (not start) so a redeploy picks up rebuilt images and the
  # regenerated nginx port publishes; restart also starts stopped units.
  for unit in hrms-mysql hrms-redis hrms-backend hrms-nginx; do
    systemctl --user restart "$unit" || stage_fail "failed to start $unit"
  done

  # Wait for mysql health before declaring success (credential-free: ping
  # is answered even on access-denied, so no password here). Container
  # name is resolved via the unit label — podman 4.9 names these
  # "systemd-hrms-mysql", so a hardcoded "hrms-mysql" never matched.
  local mysql_ctr
  mysql_ctr="$(unit_container hrms-mysql)"
  [[ -n "$mysql_ctr" ]] || stage_fail "hrms-mysql container was not created (systemctl --user status hrms-mysql)"
  for i in {1..30}; do
    podman exec "$mysql_ctr" mysqladmin ping -h localhost --silent 2>/dev/null && break
    (( i == 30 )) && stage_fail "mysql not healthy after 30 tries"
    sleep 2
  done

  stage_pas
}

# Install Quadlet unit files (idempotent). Static IPs/aliases go through
# PodmanArgs; nginx ports come from the live TLS_PORT/HTTP_PORT.
install_quadlets() {
  mkdir -p "$QUADLET_DIR"

  # Network: Quadlet owns hrms-net with fixed IPAM — created/wired at boot.
  cat > "$QUADLET_DIR/hrms-net.network" <<UNIT
[Unit]
Description=UCB HRMS static network
[Network]
NetworkName=${NET_NAME}
Subnet=${NET_SUBNET}
Gateway=${NET_GATEWAY}
[Install]
WantedBy=default.target
UNIT

  # MySQL
  local root_pw app_pw
  root_pw="$(get_env MYSQL_ROOT_PASSWORD)"
  app_pw="$(get_env DB_PASSWORD)"
  cat > "$QUADLET_DIR/hrms-mysql.container" <<UNIT
[Unit]
Description=UCB HRMS MySQL 8
[Container]
Image=docker.io/library/mysql:8.0
Network=hrms-net.network
PodmanArgs=--ip=${IP_MYSQL} --network-alias=db
Volume=hrms-db-data:/var/lib/mysql:Z
# mysqladmin ping exits 0 while the server responds, even unauthenticated —
# no password embedded in the unit (W4/W7)
Environment=MYSQL_ROOT_PASSWORD=${root_pw}
Environment=MYSQL_DATABASE=${DB_NAME}
Environment=MYSQL_USER=$(get_env DB_USER)
Environment=MYSQL_PASSWORD=${app_pw}
HealthCmd=mysqladmin ping -h localhost --silent
HealthInterval=10s
HealthRetries=6
[Service]
Restart=always
[Install]
WantedBy=default.target
UNIT

  # Redis
  cat > "$QUADLET_DIR/hrms-redis.container" <<UNIT
[Unit]
Description=UCB HRMS Redis 7
[Container]
Image=docker.io/library/redis:7-alpine
Network=hrms-net.network
PodmanArgs=--ip=${IP_REDIS} --network-alias=redis
HealthCmd=redis-cli ping
HealthInterval=10s
HealthRetries=6
[Service]
Restart=always
[Install]
WantedBy=default.target
UNIT

  # Backend
  cat > "$QUADLET_DIR/hrms-backend.container" <<UNIT
[Unit]
Description=UCB HRMS backend (Node/Express)
[Container]
Image=${IMAGE_BACKEND}
Network=hrms-net.network
PodmanArgs=--ip=${IP_BACKEND} --network-alias=backend
EnvironmentFile=%h/.config/ucb-hrms/.env
Environment=DB_HOST=${IP_MYSQL}
Environment=REDIS_URL=redis://${IP_REDIS}:6379
HealthCmd=wget -qO- http://localhost:3000/healthz || exit 1
HealthInterval=10s
HealthRetries=6
[Service]
Restart=always
[Install]
WantedBy=default.target
UNIT

  # nginx (edge: TLS + static console + /api proxy); dist comes from the
  # hrms-page volume built in install_nginx_assets
  install_nginx_assets
  cat > "$QUADLET_DIR/hrms-nginx.container" <<UNIT
[Unit]
Description=UCB HRMS nginx edge (TLS)
[Container]
Image=docker.io/library/nginx:1.27-alpine
Network=hrms-net.network
PodmanArgs=--ip=${IP_NGINX} --network-alias=nginx
PublishPort=${HTTP_PORT}:80
PublishPort=${TLS_PORT}:443
Volume=hrms-page:/usr/share/nginx/html:ro,z
Volume=%h/.config/ucb-hrms/nginx:/etc/nginx/conf.d:Z
Volume=%h/.config/ucb-hrms/tls:/etc/nginx/tls:Z
# 127.0.0.1 not localhost: Alpine wget tries ::1 first and nginx listens
# IPv4-only, so localhost made the unit report permanently unhealthy.
HealthCmd=wget -qO- http://127.0.0.1/health || exit 1
HealthInterval=10s
HealthRetries=6
[Service]
Restart=always
[Install]
WantedBy=default.target
UNIT

  # Backup oneshot + timer are PLAIN systemd units, not Quadlet files —
  # podman 4.x ignores anything else under the Quadlet dir, so they live
  # in ~/.config/systemd/user (created BEFORE the redirects below).
  mkdir -p "$SYSTEMD_USER_DIR"
  cat > "$SYSTEMD_USER_DIR/hrms-backup.service" <<UNIT
[Unit]
Description=UCB HRMS nightly DB backup (throwaway mysql container)
[Service]
Type=oneshot
# Note: this is an UNQUOTED heredoc, so dollar signs must be written
# with a backslash-dollar to survive as literal dollars in the file —
# systemd then turns the doubled dollar into a single one for the
# container shell. A bare doubled dollar here would expand to deploy.sh's
# PID (the old unit shipped -p"<pid>MYSQL_ROOT_PASSWORD", so every
# backup failed). No backticks allowed in here either: they would run
# command substitution while this heredoc is expanded.
ExecStart=/usr/bin/podman run --rm --network ${NET_NAME} -v hrms-backups:/backups:Z --env-file %h/.config/ucb-hrms/.env ${MYSQL_IMAGE_FALLBACK:-docker.io/library/mysql:8.0} /bin/sh -c 'mysqldump -h ${IP_MYSQL} -uroot -p"\$\$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers ${DB_NAME} | gzip > /backups/ucb_hrms-\$\$(date -u +%%Y%%m%%d-%%H%%M%%S).sql.gz && ls /backups/*.sql.gz | sort -r | tail -n +15 | xargs -r rm'
UNIT
  cat > "$SYSTEMD_USER_DIR/hrms-backup.timer" <<UNIT
[Unit]
Description=UCB HRMS nightly DB backup schedule
[Timer]
OnCalendar=*-*-* 01:05:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT
  # mysql/backend units embed real secrets → owner-only
  chmod 600 "$QUADLET_DIR/hrms-mysql.container" "$QUADLET_DIR/hrms-backend.container"
  # (W2/W3 fix) Backup oneshot + timer are PLAIN systemd units, not Quadlet
  # files — podman 4.x ignores anything else under the Quadlet dir, so they
  # must live in ~/.config/systemd/user.
  # Ensure the plain-systemd dir exists (Backup units are not Quadlet files:
  # podman 4.x ignores anything other than .container/.network/.volume etc.)
  # `enable` alone only writes the symlink — the timer stayed inactive
  # ("0 timers listed") until the next login, so no backup would ever run
  # on a live box. --now arms it immediately; a broken unit file must
  # fail stage 5 rather than silently promise backups that never happen.
  systemctl --user daemon-reload
  systemctl --user enable --now hrms-backup.timer
}

# nginx.conf + site config (generated once; regenerated if host changed)
install_nginx_assets() {
  mkdir -p "$CONFIG_DIR/nginx"
  podman volume exists hrms-page 2>/dev/null \
    || podman volume create hrms-page >/dev/null
  # dist volume: backend image's dist copied to a named volume so nginx mounts it.
  # The volume MUST be mounted with the shared label (:z), never the private
  # one (:Z): with :Z the cp container stamps its own MLS categories onto the
  # files and nginx (mounted without a relabel) then gets EACCES on every
  # stat() — the SPA silently 500s with "permission denied". nginx's own
  # mount carries :z too, so either side self-heals a wrong label.
  podman run --rm -v hrms-page:/target:z -v "$CONFIG_DIR/frontend-dist":/src:Z docker.io/library/node:20-alpine \
    sh -c 'cp -r /src/. /target/' >/dev/null
  # canary: a passing cp is worthless if index.html did not land — nginx
  # would only surface that as a 500 at request time.
  podman run --rm -v hrms-page:/v:z docker.io/library/alpine:3 \
    sh -c 'test -f /v/index.html' >/dev/null \
    || stage_fail "hrms-page volume missing index.html after copy"

  cat > "$CONFIG_DIR/nginx/uat.conf" <<NGINX
server {
  listen 80;
  server_name ${PUBLIC_HOST};
  # For the container healthcheck only (the redirect server must answer
  # 200 somewhere or the unit reports permanently unhealthy).
  location = /health { access_log off; return 200 'ok'; }
  location / { return 301 https://\$host:${TLS_PORT}\$request_uri; }
}
server {
  listen 443 ssl;
  server_name ${PUBLIC_HOST};
  ssl_certificate     /etc/nginx/tls/server.crt;
  ssl_certificate_key /etc/nginx/tls/server.key;
  client_max_body_size 50m;
  root /usr/share/nginx/html;
  index index.html;
  location / { try_files \$uri /index.html; }
  # Backend health endpoints must be proxied, not swallowed by the SPA
  # fallback: stage 8 greps /ready for "status":"ok", and the backend is
  # the only thing that can produce it (the SPA HTML would fail that).
  # Regex location wins over the prefix "location /" above; proxy_pass
  # without a URI passes the original path through.
  location ~ ^/(healthz|ready)\$ {
    proxy_pass http://${IP_BACKEND}:3000;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
  }
  location /api {
    proxy_pass http://${IP_BACKEND}:3000;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto https;
    # Keep per-client source IPs: the backend has "trust proxy 1" set and
    # all rate limiters key on req.ip — without this every user shares
    # nginx's own IP as one giant bucket.
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
  }
}
NGINX
}

# Helper: read a var from the runtime .env without sourcing into ourselves
get_env() {
  grep -E "^$1=" "$CONFIG_DIR/.env" | head -1 | cut -d= -f2-
}

# ════════════════════════════════════════════════════════════════════════════
# STAGE 6 — Network drift verification
# ════════════════════════════════════════════════════════════════════════════
stage6_drift_check() {
  stage_head 6 "network drift verification"

  if [[ "$RECREATE_NETWORK" == 1 ]]; then
    echo "--recreate-network: intentionally rebuilding ${NET_NAME}"
    for unit in hrms-nginx hrms-backend hrms-redis hrms-mysql; do
      systemctl --user stop "$unit" 2>/dev/null || true
    done
    # The network unit stays "active (exited)" while only the containers
    # are stopped — and because every container Requires= that unit, a
    # still-active hrms-net-network skips re-creation entirely: the rm'd
    # network would never come back and every container fails with
    # "no such network". Stop it, remove the net, then start it again so
    # Quadlet re-creates the static IPAM (clearing phantom allocations
    # left by crash-looped containers) BEFORE the containers return.
    systemctl --user stop hrms-net-network 2>/dev/null || true
    podman network rm "$NET_NAME" 2>/dev/null || true
    # podman 4.9 leak: IPAM leases live in a RUNTIME ipam.db that
    # `network rm` does NOT purge, so a long-gone container can keep the
    # address squatting ("IPAM error: requested ip address ... already
    # allocated to container ID <gone>") and every recreate fails again
    # for the same container. All units are stopped at this point, so
    # dropping the lease file is safe — it is rebuilt on the next start.
    rm -f "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/containers/networks/ipam.db"
    systemctl --user start hrms-net-network 2>/dev/null || true
    # best-effort start; a unit that truly fails is caught by the drift
    # checks below (missing container ⇒ IP "gone" ⇒ loud abort)
    systemctl --user start hrms-mysql hrms-redis hrms-backend hrms-nginx 2>/dev/null || true
    # fall through to the normal verification below — and re-baseline (the
    # new Network ID is the intended state, not drift)
  fi

  if ! podman network inspect "$NET_NAME" &>/dev/null; then
    stage_fail "$NET_NAME missing — if this is the first run, stage 5 creates it; otherwise investigate manually"
  fi

  local net_json
  # Template names differ across podman builds: 4.9 (Rocky 9) formats a
  # types.Network struct and only accepts exported Go fields (.ID/.Subnets/
  # .Subnet/.Gateway), while other builds accepted the JSON-style names.
  # Try both; the empty-check below turns total failure into a clear abort
  # instead of a raw "can't evaluate field id" crash mid-stage.
  net_json="$(podman network inspect "$NET_NAME" \
      --format '{{.ID}} {{range .Subnets}}{{.Subnet}} {{.Gateway}}{{end}}' 2>/dev/null \
    || podman network inspect "$NET_NAME" \
      --format '{{.id}} {{range .subnets}}{{.subnet}} {{.gateway}}{{end}}' 2>/dev/null \
    || true)"
  local nid sub gw
  nid="$(echo "$net_json" | awk '{print $1}')"
  sub="$(echo "$net_json" | awk '{print $2}')"
  gw="$(echo "$net_json" | awk '{print $3}')"

  # Never verify against empty values — a parse failure must fail loudly,
  # not silently "match" an unknown baseline.
  [[ -n "$nid" && "$nid" != "unknown" ]] || stage_fail "could not read network ID from podman (template mismatch on this podman version?)"
  [[ -n "$sub" && -n "$gw" ]] || stage_fail "could not read subnet/gateway from podman"

  # Baseline lives in the state file (read_state below) — there is no
  # separate load_baseline helper; the old call was to an undefined
  # function and only ever "worked" because 2>/dev/null || true hid it.
  local base_id
  base_id="$(read_state NETWORK_ID 2>/dev/null || true)"
  if [[ -n "$base_id" && "$RECREATE_NETWORK" == 1 ]]; then
    echo "re-baselining after intentional network recreation"
    base_id="$nid"
  fi
  if [[ -z "$base_id" ]]; then
    echo "first run: establishing network baseline"
  elif [[ "$base_id" != "$nid" ]]; then
    stage_fail "DRIFT: network was RECREATED (baseline ${base_id:0:8} != live ${nid:0:8}). Fix intentionally: ./deploy.sh --recreate-network, then re-restore the DB."
  fi
  if [[ -n "$base_id" ]]; then
    [[ "$sub" == "$NET_SUBNET" ]] || stage_fail "DRIFT: subnet moved (expected $NET_SUBNET, live $sub)"
    [[ "$gw" == "$NET_GATEWAY" ]] || stage_fail "DRIFT: gateway moved (expected $NET_GATEWAY, live $gw)"
  fi

  # Per-container static assignment check
  drift_container "hrms-mysql"   "$IP_MYSQL"
  drift_container "hrms-backend" "$IP_BACKEND"
  drift_container "hrms-redis"   "$IP_REDIS"
  drift_container "hrms-nginx"   "$IP_NGINX"

  # Baseline is now proven current — persist only the drift signal.
  # (Static IPs/subnet/gateway are frozen constants, not state.)
  update_state NETWORK_ID "$nid"

  stage_pas "network stable: $nid on $sub"
}

drift_container() {
  local name="$1" expected="$2"
  local ctr live
  ctr="$(unit_container "$name")"
  [[ -n "$ctr" ]] || stage_fail "DRIFT: $name container is gone (unit '$name' not running?)"
  live="$(podman inspect "$ctr" --format '{{(index .NetworkSettings.Networks "hrms-net").IPAddress}}' 2>/dev/null || true)"
  [[ "$live" == "$expected" ]] || stage_fail "DRIFT: $name IP moved (expected $expected, live ${live:-gone})"
}

# ════════════════════════════════════════════════════════════════════════════
# STAGE 7 — DB restore from .sql dump (NO SEEDING, EVER)
# ════════════════════════════════════════════════════════════════════════════
stage7_restore() {
  stage_head 7 "db restore"

  local dump
  read -r -p "Path to the .sql restore dump (schema + data): " dump
  [[ -n "$dump" && -f "$dump" && -s "$dump" ]] || stage_fail "dump path invalid or empty: $dump"
  grep -qE "CREATE TABLE|INSERT INTO" "$dump" || stage_fail "file does not look like a mysqldump (no CREATE TABLE/INSERT INTO)"

  # Idempotence: skip when the same dump is already restored
  local hash
  hash="$(sha256sum "$dump" | cut -d' ' -f1)"
  if [[ "$FORCE_RESTORE" == 0 \
      && "$(read_state DUMP_HASH 2>/dev/null)" == "$hash" \
      && "$(read_state RESTORE_OK 2>/dev/null)" == "1" ]]; then
    echo "same dump already restored (hash ${hash:0:12}); use --force-restore to re-import"
    stage_pas
    return 0
  fi

  local impdir="$CONFIG_DIR/import"
  mkdir -p "$impdir"

  # Sanitize: strip DEFINER clauses; neutralize dump-side CREATE DATABASE/USE
  # (target DB is dropped + recreated as DB_NAME, never the dump's name)
  sed -E -e "s/DEFINER[[:space:]]*=[[:space:]]*\`[^\`]+\`@\`[^\`]+\`//g" \
         -e "s/^(CREATE DATABASE|USE)[[:space:]]/-- [deploy.sh] /I" \
      "$dump" > "$impdir/import.sql"
  chmod 600 "$impdir/import.sql"; chmod 700 "$impdir"

  # The container-side script (quoting stays sane because it's a file).
  # DB_USER/DB_PASSWORD expand inside the container from --env-file vars,
  # so the plaintext password never lands in this file.
  cat > "$impdir/run.sh" <<EOS
#!/bin/sh
set -eu
mysql -h ${IP_MYSQL} -uroot -p"\${MYSQL_ROOT_PASSWORD}" \\
  -e "DROP DATABASE IF EXISTS ${DB_NAME}; CREATE DATABASE ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -h ${IP_MYSQL} -uroot -p"\${MYSQL_ROOT_PASSWORD}" ${DB_NAME} < /import/import.sql
mysql -h ${IP_MYSQL} -uroot -p"\${MYSQL_ROOT_PASSWORD}" \\
  -e "CREATE USER IF NOT EXISTS '\${DB_USER}'@'%' IDENTIFIED BY '\${DB_PASSWORD}';\\
      GRANT ALL ON ${DB_NAME}.* TO '\${DB_USER}'@'%';\\
      FLUSH PRIVILEGES;"
echo "IMPORT_OK"
EOS
  chmod 700 "$impdir/run.sh"

  # Table-count verification script (also avoids nested-quote parsing)
  cat > "$impdir/verify.sh" <<EOS
#!/bin/sh
mysql -h ${IP_MYSQL} -uroot -p"\${MYSQL_ROOT_PASSWORD}" -N \\
  -e "SELECT COUNT(*) FROM information_schema.tables WHERE TABLE_SCHEMA='${DB_NAME}';"
EOS
  chmod 700 "$impdir/verify.sh"

  # Run the import inside a throwaway mysql container
  local import_out
  if ! import_out="$(podman run --rm --network "$NET_NAME" \
       -v "$impdir":/import:Z --env-file "$CONFIG_DIR/.env" \
       docker.io/library/mysql:8.0 /bin/sh /import/run.sh 2>&1)"; then
    echo "$import_out"
    rm -rf "$impdir"
    stage_fail "dump import failed — see output above"
  fi
  echo "$import_out" | grep -q IMPORT_OK || {
    echo "$import_out"
    rm -rf "$impdir"
    stage_fail "import script did not report IMPORT_OK"
  }

  # Verify table count ≥ 10 (a real schema restored, not an empty DB)
  local n
  n="$(podman run --rm --network "$NET_NAME" \
       -v "$impdir":/import:Z --env-file "$CONFIG_DIR/.env" \
       docker.io/library/mysql:8.0 /bin/sh /import/verify.sh | tail -1 | tr -d '[:space:]')"
  rm -rf "$impdir"
  [[ "$n" =~ ^[0-9]+$ ]] || stage_fail "could not verify table count after restore"
  if (( n < 10 )); then
    stage_fail "restore verification failed — only $n table(s); expected the full schema"
  fi

  update_state DUMP_HASH "$hash"
  update_state RESTORE_OK "1"
  echo "imported $n tables into ${DB_NAME}"
  stage_pas "restore complete (no seeding; boot applies additive schema upgrade via AUTO_MIGRATE=true)"
}

# ════════════════════════════════════════════════════════════════════════════
# STAGE 8 — Health & endpoint verification
# ════════════════════════════════════════════════════════════════════════════
stage8_health() {
  stage_head 8 "health & endpoint verification"

  local base="https://${PUBLIC_HOST}:${TLS_PORT}"
  # --resolve pins the hostname to loopback so checks work even behind
  # hairpin-less NAT where the public DNS name doesn't resolve on-box.
  local R=(--resolve "${PUBLIC_HOST}:${TLS_PORT}:127.0.0.1")

  curl -kfsS --max-time 10 "${R[@]}" -o /dev/null "$base/healthz" \
    || stage_fail "GET $base/healthz failed (nginx or backend down?)"

  ready="$(curl -kfsS --max-time 10 "${R[@]}" "$base/ready")" \
    || stage_fail "GET $base/ready failed"
  echo "$ready" | grep -q '"status":"ok"' || stage_fail "/ready did not report ok"
  echo "/ready: $ready"

  curl -kfsS --max-time 10 "${R[@]}" -o /dev/null "$base/" \
    || stage_fail "console UI did not load over HTTPS"

  code="$(curl -k --max-time 10 "${R[@]}" -s -o /dev/null -w '%{http_code}' "$base/api")"
  [[ "$code" == "200" ]] || stage_fail "/api returned HTTP $code"

  stage_pas "all endpoints verified over https://${PUBLIC_HOST}:${TLS_PORT}"
}

# ════════════════════════════════════════════════════════════════════════════
# STAGE 9 — Report (main links + bootstrap escape hatch)
# ════════════════════════════════════════════════════════════════════════════
stage9_report() {
  stage_head 9 "report"

  local base="https://${PUBLIC_HOST}:${TLS_PORT}"
  cat <<REPORT

────────────────────────────────────────────────────────────
 UCB HRMS (UAT) deployed successfully
────────────────────────────────────────────────────────────
 MAIN LINKS
   Console:            $base/
   API:                $base/api/v1
   Health:             $base/healthz
   Readiness:          $base/ready

 BACKUP
    Schedule:           nightly 01:05 local time (systemd user timer)
   Manual:             ./deploy.sh --backup-now
   Retention:          last 14 dumps in the hrms-backups volume

 BOOTSTRAP ESCAPE HATCH — ONLY if the restored dump has no usable
   super-admin login. The endpoint is GET and reads the initial
   credentials from the runtime .env (not from a request body):
     1. Append to $CONFIG_DIR/.env:
          SUPER_ADMIN_EMAIL=<you@banihal.in>
          SUPER_ADMIN_PASSWORD=<new-password>
     2. ./deploy.sh --stage 5        (restart backend with the new vars)
     3. Visit (one-time):
        $base/admin/setup/bootstrap-super-admin?token=<SETUP_TOKEN>
        (token: grep SETUP_TOKEN $CONFIG_DIR/.env | cut -d= -f2)
     4. After the first sign-in: remove SETUP_TOKEN and ALLOW_PROD_SETUP
        (and the creds you appended) from the .env, ./deploy.sh --stage 5
────────────────────────────────────────────────────────────
REPORT
  stage_pas
}

# ════════════════════════════════════════════════════════════════════════════
# status subcommand
# ════════════════════════════════════════════════════════════════════════════
show_status() {
  echo "── host ───────────────────────────────────────────"
  printf '%-14s %s\n' "os" "${OS_NAME:-$OS_ID}${TLS_PORT:+ ($OS_PKG_MGR)}"
  echo "── units ──────────────────────────────────────────"
  for u in hrms-nginx hrms-backend hrms-redis hrms-mysql; do
    printf '%-14s %s\n' "$u" "$(systemctl --user is-active "$u" 2>/dev/null || echo 'not installed')"
  done
  echo "── backup timer ───────────────────────────────────"
  systemctl --user list-timers hrms-backup.timer 2>/dev/null | tail -1 || true
  echo "── network ────────────────────────────────────────"
  podman network inspect "$NET_NAME" --format 'Network: {{.Name}}  ID: {{.ID}}  subnet: {{(index .Subnets 0).Subnet}}' 2>/dev/null \
    || podman network inspect "$NET_NAME" --format 'Network: {{.name}}  ID: {{.id}}  subnet: {{(index .subnets 0).subnet}}' 2>/dev/null \
    || echo "hrms-net: not present"
  echo "── last restore ───────────────────────────────────"
  local dh
  dh="$(read_state DUMP_HASH 2>/dev/null | cut -c1-12)"
  echo "dump hash: ${dh:-none}"
}

# Manual backup trigger (same command as the timer's unit)
run_backup_now() {
  systemd-run --user --unit=hrms-backup-now --description "manual hrms backup" \
    podman run --rm --network "$NET_NAME" -v hrms-backups:/backups:Z --env-file "$CONFIG_DIR/.env" \
    docker.io/library/mysql:8.0 /bin/sh -c 'mysqldump -h '"${IP_MYSQL}"' -uroot -p"$$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers '"${DB_NAME}"' | gzip > /backups/ucb_hrms-$$(date -u +"%Y%m%d-%H%M%S").sql.gz'
  echo "backup started (journalctl --user -u hrms-backup-now to follow)"
  systemctl --user status hrms-backup-now --no-pager 2>/dev/null | head -3 || true
}

# ════════════════════════════════════════════════════════════════════════════
# Dispatcher
# ════════════════════════════════════════════════════════════════════════════
run_stage() {
  case "$1" in
    0) stage0_preflight ;;
    1) load_config; stage1_install ;;
    2) load_config; stage2_verify_install ;;
    3) stage3_secrets ;;
    4) load_config; stage4_build ;;
    5) load_config; stage5_deploy ;;
    6) load_config; stage6_drift_check ;;
    7) load_config; stage7_restore ;;
    8) load_config; stage8_health ;;
    9) load_config; stage9_report ;;
    *) echo "unknown stage $1"; exit 1 ;;
  esac
}

# Subcommands (dispatched here, after all definitions exist)
if [[ "$SUBCMD" == "status" ]]; then
  load_config; show_status; exit 0
fi
if [[ "$SUBCMD" == "set-hostname" ]]; then
  load_config; set_hostname "$SUBCMD_ARG"; exit 0
fi

if [[ "$BACKUP_NOW" == 1 ]]; then
  load_config
  run_backup_now
  exit 0
fi

if [[ "$STAGE" == "all" ]]; then
  for s in 0 1 2 3 4 5 6 7 8 9; do
    echo "═════════════════════════════════════════"
    # Run each stage in its own subshell. The old
    # `run_stage "$s" || { echo ABORTED; exit 1; }` put run_stage in an
    # AND-OR list, which makes bash IGNORE set -e throughout the function
    # body — every unguarded failure was silently skipped and the deploy
    # limped on half-configured (that is how the always-failing enable
    # line, bad container names etc. went unnoticed). A standalone
    # subshell keeps -e effective; stage_fail still exits with its message.
    set +e
    ( set -e; run_stage "$s" )
    rc=$?
    set -e
    if (( rc != 0 )); then
      echo "ABORTED at stage $s"
      exit 1
    fi
  done
else
  load_config
  run_stage "$STAGE"
fi

echo "deploy.sh: complete"