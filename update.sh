#!/usr/bin/env bash
# update.sh — Pull latest changes and rebuild/restart Podman Quadlet stack
#
# When run on the server:
# 1. Fetches and pulls the latest changes from git
# 2. Rebuilds the unified backend + frontend image via Podman
# 3. Refreshes the frontend static distribution in the nginx volume
# 4. Reloads systemd Quadlets and restarts the services (rootless user or system mode)
# 5. Performs health and readiness verification

set -euo pipefail

# Determine script and project directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================================"
echo " UCB HRMS — Update & Quadlet Rebuild"
echo " Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
echo " User: $(whoami) (UID: $(id -u))"
echo " Directory: $SCRIPT_DIR"
echo "============================================================"

# ── Determine Systemd mode & User execution ────────────────────────────────
# Rootless Podman Quadlets run as a regular user via `systemctl --user`.
# If run under `su -` or without DBUS_SESSION_BUS_ADDRESS, systemd user bus
# needs XDG_RUNTIME_DIR to connect. If run as root, detect whether services
# were installed system-wide or under a specific non-root user.
CURRENT_UID="$(id -u)"
SYSTEMCTL_CMD=()

if [[ "$CURRENT_UID" -eq 0 ]]; then
  # Checked if user Quadlets exist for a non-root deployment (e.g., in /home/*/.config/containers/systemd)
  APP_USER=""
  for d in /home/*/.config/containers/systemd/hrms-backend.container; do
    if [[ -f "$d" ]]; then
      APP_USER="$(echo "$d" | cut -d/ -f3)"
      break
    fi
  done

  if [[ -n "$APP_USER" ]]; then
    APP_UID="$(id -u "$APP_USER")"
    echo "  Notice: Running as root, but Quadlet stack is owned by rootless user '$APP_USER' (UID: $APP_UID)."
    export XDG_RUNTIME_DIR="/run/user/${APP_UID}"
    SYSTEMCTL_CMD=(runuser -u "$APP_USER" -- env XDG_RUNTIME_DIR="/run/user/${APP_UID}" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${APP_UID}/bus" systemctl --user)
    PODMAN_CMD=(runuser -u "$APP_USER" -- podman)
    USER_HOME="/home/${APP_USER}"
  elif systemctl list-unit-files 2>/dev/null | grep -q "hrms-backend.service"; then
    # System-level Quadlet service in /etc/containers/systemd
    echo "  Running as root (System-wide Quadlets mode)."
    SYSTEMCTL_CMD=(systemctl)
    PODMAN_CMD=(podman)
    USER_HOME="/root"
  else
    # Fallback to current root user session
    export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/0}"
    SYSTEMCTL_CMD=(systemctl --user)
    PODMAN_CMD=(podman)
    USER_HOME="${HOME:-/root}"
  fi
else
  # Non-root user: Ensure XDG_RUNTIME_DIR and DBUS socket are properly set
  if [[ -z "${XDG_RUNTIME_DIR:-}" || ! -d "${XDG_RUNTIME_DIR:-}" ]]; then
    export XDG_RUNTIME_DIR="/run/user/${CURRENT_UID}"
  fi
  if [[ -S "${XDG_RUNTIME_DIR}/bus" ]]; then
    export DBUS_SESSION_BUS_ADDRESS="unix:path=${XDG_RUNTIME_DIR}/bus"
  fi
  SYSTEMCTL_CMD=(systemctl --user)
  PODMAN_CMD=(podman)
  USER_HOME="${HOME}"
fi

# Test systemd connection before proceeding
if ! "${SYSTEMCTL_CMD[@]}" daemon-reload >/dev/null 2>&1; then
  # If regular user failed, check if systemctl without --user is intended (system units)
  if [[ "$CURRENT_UID" -eq 0 ]] && systemctl daemon-reload >/dev/null 2>&1; then
    SYSTEMCTL_CMD=(systemctl)
  else
    echo "WARNING: Could not connect to systemd bus using '${SYSTEMCTL_CMD[*]}'." >&2
    echo "  If running rootless Podman, make sure you run as your regular user (e.g. exit root)," >&2
    echo "  or ensure linger is enabled via: loginctl enable-linger \$(whoami)" >&2
  fi
fi

# ── 1. Git Pull ────────────────────────────────────────────────────────────
BRANCH="${GIT_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")}"
echo ""
echo "→ Checking for updates on branch '$BRANCH'..."

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  CURRENT_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo "unknown")"
  echo "  Current commit: ${CURRENT_COMMIT:0:8}"

  echo "  Running git fetch origin $BRANCH..."
  git fetch origin "$BRANCH" 2>/dev/null || true

  UPSTREAM_COMMIT="$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "$CURRENT_COMMIT")"

  if [[ "$CURRENT_COMMIT" == "$UPSTREAM_COMMIT" && "${FORCE_REBUILD:-0}" != "1" ]]; then
    echo "  Local branch is already up-to-date with origin/$BRANCH (${CURRENT_COMMIT:0:8})."
    echo "  (Set FORCE_REBUILD=1 to force rebuilding even without new commits)"
  else
    echo "  Pulling latest changes from origin/$BRANCH (${UPSTREAM_COMMIT:0:8})..."
    git pull --ff-only origin "$BRANCH"
  fi
else
  echo "  Warning: Not a git repository or git unavailable. Skipping git pull."
fi

# ── 2. Rebuild backend & frontend container ────────────────────────────────
echo ""
echo "→ Rebuilding container image (hrms-backend + frontend dist)..."
IMAGE_NAME="localhost/hrms-backend:latest"
CONFIG_DIR="${USER_HOME}/.config/ucb-hrms"

"${PODMAN_CMD[@]}" build -t "$IMAGE_NAME" .

# ── 3. Update frontend assets for Nginx edge ───────────────────────────────
echo ""
echo "→ Extracting updated frontend dist for Nginx..."
mkdir -p "$CONFIG_DIR/frontend-dist"

# Remove any stale temporary extraction container
"${PODMAN_CMD[@]}" rm -f hrms-dist-extract >/dev/null 2>&1 || true

if ! "${PODMAN_CMD[@]}" create --name hrms-dist-extract "$IMAGE_NAME" true >/dev/null 2>&1; then
  echo "ERROR: Failed to create temporary container to extract frontend dist" >&2
  exit 1
fi

if ! "${PODMAN_CMD[@]}" cp hrms-dist-extract:/app/frontend/dist/. "$CONFIG_DIR/frontend-dist/" >/dev/null 2>&1; then
  "${PODMAN_CMD[@]}" rm -f hrms-dist-extract >/dev/null 2>&1 || true
  echo "ERROR: Failed to copy frontend/dist from image" >&2
  exit 1
fi
"${PODMAN_CMD[@]}" rm -f hrms-dist-extract >/dev/null 2>&1 || true

# Update hrms-page podman volume mounted by hrms-nginx
if "${PODMAN_CMD[@]}" volume exists hrms-page >/dev/null 2>&1; then
  echo "  Updating hrms-page named volume..."
  "${PODMAN_CMD[@]}" run --rm -v hrms-page:/target:z -v "$CONFIG_DIR/frontend-dist":/src:Z docker.io/library/node:20-alpine \
    sh -c 'cp -r /src/. /target/' >/dev/null
fi

# Ensure nginx uat.conf proxies /assets if missing
NGINX_CONF="$CONFIG_DIR/nginx/uat.conf"
if [[ -f "$NGINX_CONF" ]] && ! grep -q "location /assets" "$NGINX_CONF"; then
  echo "  Adding /assets proxy rule to $NGINX_CONF..."
  sed -i '/location \/api {/i \  location /assets {\n    proxy_pass http://10.89.0.20:3000;\n    proxy_set_header Host $host;\n    proxy_set_header X-Forwarded-Proto https;\n    proxy_set_header X-Real-IP $remote_addr;\n    proxy_set_header X-Forwarded-For $remote_addr;\n  }' "$NGINX_CONF"
fi

# ── 4. Reload Systemd Quadlets and Restart Services ───────────────────────
echo ""
echo "→ Reloading systemd daemon and restarting Quadlet units..."
"${SYSTEMCTL_CMD[@]}" daemon-reload

echo "  Restarting hrms-backend..."
"${SYSTEMCTL_CMD[@]}" restart hrms-backend || echo "  Warning: could not restart hrms-backend"

echo "  Restarting hrms-nginx..."
"${SYSTEMCTL_CMD[@]}" restart hrms-nginx || echo "  Warning: could not restart hrms-nginx"

# ── 5. Health Check ────────────────────────────────────────────────────────
echo ""
echo "→ Waiting for backend health..."
READY=0
for i in {1..30}; do
  if "${PODMAN_CMD[@]}" exec systemd-hrms-backend wget -qO- http://localhost:3000/healthz >/dev/null 2>&1 \
     || "${PODMAN_CMD[@]}" exec hrms-backend wget -qO- http://localhost:3000/healthz >/dev/null 2>&1; then
    READY=1
    echo "  Backend is healthy! (attempt $i)"
    break
  fi
  sleep 2
done

if [[ "$READY" -ne 1 ]]; then
  echo "WARNING: Backend health check timed out. Check logs using:" >&2
  echo "  journalctl --user -u hrms-backend -n 50 --no-pager" >&2
fi

echo ""
echo "============================================================"
echo " Quadlet Service Status:"
echo "============================================================"
for u in hrms-backend hrms-nginx hrms-redis hrms-mysql; do
  STATUS="$("${SYSTEMCTL_CMD[@]}" is-active "$u" 2>/dev/null || echo "inactive")"
  printf "  %-15s : %s\n" "$u" "$STATUS"
done

echo ""
echo "Update and Quadlet rebuild completed successfully."
