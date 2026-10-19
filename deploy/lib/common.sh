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