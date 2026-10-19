#!/usr/bin/env bash
# deploy/lib/common.sh — shared helpers for deploy.sh stages
set -euo pipefail

# ── State directory (flat KEY=VALUE, zero other env bleed) ─────────────────
STATE_DIR="$HOME/.local/state/ucb-hrms"
CONFIG_DIR="$HOME/.config/ucb-hrms"
mkdir -p "$STATE_DIR" "$CONFIG_DIR"

 stage_head() {
   local sno="$1" name="$2"
   echo "=== STAGE $sno: $name ==="
 }

 stage_pas() {
   echo "PASS"
 }

 stage_fail() {
   echo "FAIL: $*"
   exit 1
 }

# ── Simple KEY=VALUE state file ────────────────────────────────────────────
# Used for things like DUMP_HASH, PUBLIC_HOST, etc.
 read_state() {
   local key="$1"
   grep -E "^${key}=" "$STATE_DIR/state.env" 2>/dev/null | cut -d= -f2- || true
 }

 update_state() {
   local key="$1" value="$2"
   # atomic-ish: write to temp then rename
   local tmp
   tmp="$(mktemp "${STATE_DIR}/state.env.XXXXXX")"
   if [[ -f "$STATE_DIR/state.env" ]]; then
     # keep the other entries; grep's exit 1 ("no lines survive") is fine
     { grep -vE "^${key}=" "$STATE_DIR/state.env" > "$tmp" || true; }
   fi
   echo "${key}=${value}" >> "$tmp"
   mv "$tmp" "$STATE_DIR/state.env"
   chmod 600 "$STATE_DIR/state.env"
 }

# ── Quoting helper ─────────────────────────────────────────────────────────
# Safely single-quote a string, even if it contains single quotes.
# Usage: q "some 'quoted' text"
q() {
  local s="$1"
  # Bash 4.4+ has printf '%q', but we want POSIX-ish compatibility:
  printf '%s' "$s" | sed "s/'/\\\\''/g"
}

# ── Config dir ─────────────────────────────────────────────────────────────
# All generated certs, .env, imports land under $CONFIG_DIR

# ── OS detection (the script adapts to whichever distro it runs on) ────────
# Fills OS_ID, OS_NAME, OS_VERSION, OS_PKG_MGR from /etc/os-release without
# sourcing it (sourcing would leak vars like HOME_URL/NAME into our shell).
os_rel_field() {
  grep -E "^$1=" /etc/os-release 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'
}

detect_os() {
  if [[ ! -r /etc/os-release ]]; then
    OS_ID="unknown"; OS_NAME="unknown"; OS_VERSION=""; OS_PKG_MGR="unknown"
    return 1
  fi
  OS_ID="$(os_rel_field ID)"
  OS_NAME="$(os_rel_field PRETTY_NAME)"
  OS_NAME="${OS_NAME:-$(os_rel_field NAME)}"
  OS_VERSION="$(os_rel_field VERSION_ID)"
  case "$OS_ID" in
    rocky|rhel|centos|almalinux|ol|rocky-*)     OS_PKG_MGR="dnf" ;;
    fedora)                                    OS_PKG_MGR="dnf" ;;
    ubuntu|debian|linuxmint|pop|kali)          OS_PKG_MGR="apt-get" ;;
    opensuse-leap|opensuse-tumbleweed|sles)    OS_PKG_MGR="zypper" ;;
    arch|manjaro|endeavouros)                  OS_PKG_MGR="pacman" ;;
    alpine)                                    OS_PKG_MGR="apk" ;;
    *)
      # Unknown ID — follow ID_LIKE ("rhel centos fedora", "debian", …)
      OS_PKG_MGR="unknown"
      local like
      for like in $(os_rel_field ID_LIKE); do
        case "$like" in
          rhel|centos|fedora|rocky) OS_PKG_MGR="dnf"; break ;;
          debian)                   OS_PKG_MGR="apt-get"; break ;;
          suse)                     OS_PKG_MGR="zypper"; break ;;
          arch)                     OS_PKG_MGR="pacman"; break ;;
          alpine)                   OS_PKG_MGR="apk"; break ;;
        esac
      done
      ;;
  esac
  [[ -n "$OS_ID" ]] || OS_ID="unknown"
  return 0
}

# Oldest podman that ships Quadlet (needed for the auto-restart units).
# Ubuntu 22.04 LTS installs podman 3.4 without this — stage 2 refuses with
# an upgrade hint instead of silently producing a broken deployment.
readonly PODMAN_MIN="4.4.0"

version_ge() {
  # version_ge <candidate> <floor> — works for dotted versions
  printf '%s\n%s\n' "$2" "$1" | sort -V | head -1 | grep -qx "$2"
}

# Install podman with the detected distro's package manager (sudo prompts
# for a password; in CI without a TTY use MANUAL echoes as before).
pkg_install_podman() {
  echo "package manager: ${OS_PKG_MGR} (for ${OS_ID})"
  case "$OS_PKG_MGR" in
    dnf)      sudo dnf -y install podman ;;
    apt-get)  sudo apt-get update && sudo apt-get install -y podman uidmap ;;
    zypper)   sudo zypper -n install podman ;;
    pacman)   sudo pacman -S --noconfirm podman ;;
    apk)      sudo apk add podman ;;
    *)
      echo "MANUAL: install podman with ${OS_ID}'s package manager, then re-run ./deploy.sh"
      return 1
      ;;
  esac
}