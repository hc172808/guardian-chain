#!/usr/bin/env bash
# Server-only updater. Never run against the Lovable development checkout.
# Run as the same OS user that owns the application's PM2 process.
set -Eeuo pipefail
umask 077
APP_DIR="${APP_DIR:?Set APP_DIR to the deployed repository}"
UPDATE_STATE_DIR="${UPDATE_STATE_DIR:?Set UPDATE_STATE_DIR outside the repository}"
PM2_APP="${PM2_APP:-gydschain-api}"
HEALTH_URL="${UPDATE_HEALTH_URL:-http://127.0.0.1:5001/api/deployment-health}"
mkdir -p "$UPDATE_STATE_DIR"
exec 9>"$UPDATE_STATE_DIR/lock"
flock -n 9 || exit 75
LOG="$UPDATE_STATE_DIR/private.log"
STATUS="$UPDATE_STATE_DIR/status.json"
backup=""; previous=""; changed=0
status() {
  printf '{"phase":"%s","updatedAt":"%s"}\n' "$1" "$(date -u +%FT%TZ)" > "$STATUS.tmp"
  mv "$STATUS.tmp" "$STATUS"
}
healthy() {
  local response
  for ((attempt=0; attempt<30; attempt++)); do
    if response=$(curl --fail --silent --max-time 3 "$HEALTH_URL") &&
      node -e 'const d=JSON.parse(process.argv[1]);process.exit(d.ok===true?0:1)' "$response"; then
      return 0
    fi
    # Delay only inside the bounded health-check loop.
    sleep 2
  done
  return 1
}
failed() {
  trap - ERR TERM INT
  set +e
  if (( changed )); then
    status rolling_back
    local restored=1
    git -C "$APP_DIR" reset --hard "$previous" >> "$LOG" 2>&1 || restored=0
    rm -rf "$APP_DIR/node_modules" "$APP_DIR/dist" "$APP_DIR/dist-server"
    tar -xpf "$backup" -C "$APP_DIR" >> "$LOG" 2>&1 || restored=0
    pm2 restart "$PM2_APP" --update-env >> "$LOG" 2>&1 || restored=0
    if (( restored )) && healthy >> "$LOG" 2>&1; then
      status rolled_back
    else
      status rollback_failed
    fi
  else
    status failed
  fi
  # Keep the private backup for manual recovery after any failed update.
  exit 1
}
trap failed ERR TERM INT
status checking
for dependency in git npm node pm2 tar curl flock; do
  command -v "$dependency" >/dev/null
done
[[ -d "$APP_DIR/.git" && -f "$APP_DIR/package-lock.json" ]]
[[ "$UPDATE_STATE_DIR/" != "$APP_DIR/"* ]]
git -C "$APP_DIR" diff --quiet
git -C "$APP_DIR" diff --cached --quiet
pm2 describe "$PM2_APP" >> "$LOG" 2>&1
previous=$(git -C "$APP_DIR" rev-parse HEAD)
branch=$(git -C "$APP_DIR" symbolic-ref --short HEAD)
status backing_up
backup=$(mktemp "$UPDATE_STATE_DIR/backup.XXXXXX.tar")
# Database files, uploads and logs are persistent, not deployment artifacts.
tar --exclude='./.git' --exclude='./data' --exclude='./uploads' --exclude='./logs' \
  -cpf "$backup" -C "$APP_DIR" . >> "$LOG" 2>&1
status pulling
changed=1
git -C "$APP_DIR" pull --ff-only origin "$branch" >> "$LOG" 2>&1
status installing
(cd "$APP_DIR" && npm ci --legacy-peer-deps) >> "$LOG" 2>&1
status building
(cd "$APP_DIR" && npm run build) >> "$LOG" 2>&1
status restarting
pm2 restart "$PM2_APP" --update-env >> "$LOG" 2>&1
status verifying
healthy >> "$LOG" 2>&1
status succeeded
rm -f "$backup"