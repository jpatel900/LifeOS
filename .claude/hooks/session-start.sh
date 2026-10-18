#!/bin/bash
# SessionStart hook (owner 2026-10-17): cloud-session setup for the local
# Supabase stack used by the Migrations + RLS checks and
# RUN_SUPABASE_RLS_TESTS=1 runs.
#
# - Runs only in Claude Code cloud sessions (CLAUDE_CODE_REMOTE=true).
# - Installs the Supabase CLI if missing (same pin as ci.yml's
#   supabase/setup-cli steps; bump them together) and starts dockerd if it
#   is not already running.
# - Never blocks the session: every step is best-effort with a timeout, and
#   the script always exits 0. Fast exit when both are already set up.

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

SUPABASE_CLI_VERSION="2.109.1"
BIN_DIR="${HOME:-/root}/.local/bin"

log() { echo "[session-start] $*" >&2; }

ensure_supabase() {
  if command -v supabase >/dev/null 2>&1 || [ -x "$BIN_DIR/supabase" ]; then
    return 0
  fi
  case "$(uname -m)" in
    x86_64 | amd64) arch="amd64" ;;
    aarch64 | arm64) arch="arm64" ;;
    *) log "supabase: unsupported arch $(uname -m), skipping"; return 0 ;;
  esac
  url="https://github.com/supabase/cli/releases/download/v${SUPABASE_CLI_VERSION}/supabase_linux_${arch}.tar.gz"
  tmp="$(mktemp -d)" || return 0
  if curl -fsSL --max-time 90 "$url" -o "$tmp/supabase.tgz" \
    && tar -xzf "$tmp/supabase.tgz" -C "$tmp" supabase \
    && mkdir -p "$BIN_DIR" && mv "$tmp/supabase" "$BIN_DIR/supabase" \
    && chmod +x "$BIN_DIR/supabase"; then
    log "supabase: installed v${SUPABASE_CLI_VERSION} to $BIN_DIR"
  else
    log "supabase: install failed (non-fatal)"
  fi
  rm -rf "$tmp"
}

ensure_path() {
  case ":$PATH:" in *":$BIN_DIR:"*) return 0 ;; esac
  if [ -x "$BIN_DIR/supabase" ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export PATH=\"$BIN_DIR:\$PATH\"" >>"$CLAUDE_ENV_FILE"
  fi
}

ensure_dockerd() {
  command -v docker >/dev/null 2>&1 || { log "docker: not installed, skipping"; return 0; }
  if timeout 5 docker info >/dev/null 2>&1; then
    return 0
  fi
  if ! command -v dockerd >/dev/null 2>&1 || [ "$(id -u)" != "0" ]; then
    log "docker: daemon not running and cannot start it here (non-fatal)"
    return 0
  fi
  nohup dockerd >/tmp/dockerd.log 2>&1 &
  for _ in $(seq 1 15); do
    if timeout 2 docker info >/dev/null 2>&1; then
      log "docker: dockerd started"
      return 0
    fi
    sleep 1
  done
  log "docker: dockerd still starting; see /tmp/dockerd.log (non-fatal)"
}

ensure_supabase || true
ensure_path || true
ensure_dockerd || true
exit 0
