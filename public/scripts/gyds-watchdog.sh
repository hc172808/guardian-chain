#!/usr/bin/env bash
# GYDSchain self-healing API/database watchdog.
# PM2 handles process crashes; this catches a hung app, broken local API route,
# or database outage that leaves the process alive but unusable.
set -u

APP_PORT="${APP_PORT:-5001}"
PM2_APP="${PM2_APP:-gydschain-api}"
PM2_USER="${PM2_USER:-}"
LOG_FILE="${LOG_FILE:-/var/log/gydschain/watchdog.log}"
STATE_FILE="${STATE_FILE:-/run/gyds-watchdog.state}"
RESTART_COOLDOWN_SECONDS="${RESTART_COOLDOWN_SECONDS:-300}"

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
mkdir -p "$(dirname "$STATE_FILE")" 2>/dev/null || true

log() {
  printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >> "$LOG_FILE" 2>/dev/null || true
}

api_is_healthy() {
  local captcha db
  captcha="$(curl -fsS --max-time 8 -H 'Accept: application/json' \
    "http://127.0.0.1:${APP_PORT}/api/auth/captcha" 2>/dev/null || true)"
  [[ "$captcha" == *'"challengeId"'* || "$captcha" == *'"mode":"hcaptcha"'* ]] || return 1

  db="$(curl -fsS --max-time 8 -H 'Accept: application/json' \
    "http://127.0.0.1:${APP_PORT}/api/health/db" 2>/dev/null || true)"
  [[ "$db" == *'"database":true'* ]]
}

if api_is_healthy; then
  rm -f "$STATE_FILE" 2>/dev/null || true
  exit 0
fi

now="$(date +%s)"
failures=0
last_restart=0
if [[ -f "$STATE_FILE" ]]; then
  state_failures=""
  state_last_restart=""
  read -r state_failures state_last_restart < "$STATE_FILE" || true
  [[ "$state_failures" =~ ^[0-9]+$ ]] && failures="$state_failures"
  [[ "$state_last_restart" =~ ^[0-9]+$ ]] && last_restart="$state_last_restart"
fi
failures=$((failures + 1))

# Require two consecutive failures and avoid restart loops during outages.
if (( failures < 2 )); then
  printf '%s %s\n' "$failures" "$last_restart" > "$STATE_FILE" 2>/dev/null || true
  log "Health check failed once; waiting for a second consecutive failure"
  exit 0
fi

if (( now - last_restart < RESTART_COOLDOWN_SECONDS )); then
  printf '%s %s\n' "$failures" "$last_restart" > "$STATE_FILE" 2>/dev/null || true
  log "Health check still failing; restart cooldown active"
  exit 0
fi

log "Health check failed twice; restarting PM2 app ${PM2_APP}"
if [[ -n "$PM2_USER" && "$PM2_USER" != "root" ]] && id -u "$PM2_USER" >/dev/null 2>&1; then
  su - "$PM2_USER" -c "pm2 restart '$PM2_APP' --update-env" >> "$LOG_FILE" 2>&1 || true
else
  pm2 restart "$PM2_APP" --update-env >> "$LOG_FILE" 2>&1 || true
fi

printf '0 %s\n' "$now" > "$STATE_FILE" 2>/dev/null || true
sleep 5
if api_is_healthy; then
  log "Application recovered after PM2 restart"
else
  log "Application still unhealthy after PM2 restart; inspect PM2 and database logs"
fi
