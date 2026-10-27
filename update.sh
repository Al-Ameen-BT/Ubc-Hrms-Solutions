#!/usr/bin/env bash
# update.sh — Pull latest changes and rebuild/restart Podman Quadlet stack
#
# When run on the server:
# 1. Fetches and pulls the latest changes from git
# 2. Rebuilds the unified backend + frontend image via Podman
# 3. Refreshes the frontend static distribution in the nginx volume
# 4. Reloads systemd user daemon and restarts the Quadlet services (hrms-backend, hrms-nginx)
# 5. Performs health and readiness verification

set -euo pipefail

# Determine script and project directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================================"
echo " UCB HRMS — Update & Quadlet Rebuild"
echo " Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
echo " Directory: $SCRIPT_DIR"
echo "============================================================"

# ── 1. Git Pull ────────────────────────────────────────────────────────────
BRANCH="${GIT_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")}"
echo "→ Checking for updates on branch '$BRANCH'..."

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  CURRENT_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo "unknown")"
  echo "  Current commit: ${CURRENT_COMMIT:0:8}"

  echo "  Running git fetch origin $BRANCH..."
  git fetch origin "$BRANCH"

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
CONFIG_DIR="${HOME}/.config/ucb-hrms"

podman build -t "$IMAGE_NAME" .

# ── 3. Update frontend assets for Nginx edge ───────────────────────────────
echo ""
echo "→ Extracting updated frontend dist for Nginx..."
mkdir -p "$CONFIG_DIR/frontend-dist"

# Remove any stale temporary extraction container
podman rm -f hrms-dist-extract >/dev/null 2>&1 || true

if ! podman create --name hrms-dist-extract "$IMAGE_NAME" true >/dev/null 2>&1; then
  echo "ERROR: Failed to create temporary container to extract frontend dist" >&2
  exit 1
fi

if ! podman cp hrms-dist-extract:/app/frontend/dist/. "$CONFIG_DIR/frontend-dist/" >/dev/null 2>&1; then
  podman rm -f hrms-dist-extract >/dev/null 2>&1 || true
  echo "ERROR: Failed to copy frontend/dist from image" >&2
  exit 1
fi
podman rm -f hrms-dist-extract >/dev/null 2>&1 || true

# Update hrms-page podman volume mounted by hrms-nginx
if podman volume exists hrms-page >/dev/null 2>&1; then
  echo "  Updating hrms-page named volume..."
  podman run --rm -v hrms-page:/target:z -v "$CONFIG_DIR/frontend-dist":/src:Z docker.io/library/node:20-alpine \
    sh -c 'cp -r /src/. /target/' >/dev/null
fi

# ── 4. Reload Systemd Quadlets and Restart Services ───────────────────────
echo ""
echo "→ Reloading systemd user daemon and restarting Quadlet units..."
systemctl --user daemon-reload

echo "  Restarting hrms-backend..."
systemctl --user restart hrms-backend

echo "  Restarting hrms-nginx..."
systemctl --user restart hrms-nginx

# ── 5. Health Check ────────────────────────────────────────────────────────
echo ""
echo "→ Waiting for backend health..."
READY=0
for i in {1..30}; do
  if podman exec systemd-hrms-backend wget -qO- http://localhost:3000/healthz >/dev/null 2>&1 \
     || podman exec hrms-backend wget -qO- http://localhost:3000/healthz >/dev/null 2>&1; then
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
  STATUS="$(systemctl --user is-active "$u" 2>/dev/null || echo "unknown")"
  printf "  %-15s : %s\n" "$u" "$STATUS"
done

echo ""
echo "Update and Quadlet rebuild completed successfully."
