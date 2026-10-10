#!/usr/bin/env bash
# Install or safely update the canonical GYDS fullnode service.
#
# This script manages only the Go node. It does not install the dashboard or
# database, change firewall rules, configure Nginx, or remove chain data.
#
# Usage:
#   sudo bash install-fullnode-service.sh
#   sudo bash install-fullnode-service.sh --app-dir /opt/gyds-fullnode
set -euo pipefail
IFS=$'\n\t'

readonly REPO_URL="https://github.com/hc172808/fullnode.git"
readonly BRANCH="main"
readonly SERVICE_NAME="gyds-fullnode"
readonly ENV_FILE="/etc/gyds-fullnode.env"
readonly BACKUP_ROOT="${GYDS_BACKUP_DIR:-/var/backups/gyds-fullnode}"
readonly LOCK_FILE="/run/lock/gyds-fullnode-install.lock"

APP_DIR="${GYDS_APP_DIR:-/opt/gyds-fullnode}"
BIN_DIR="${GYDS_BIN:-/usr/local/bin}"
DATA_DIR_OVERRIDE="${GYDS_DATA_DIR:-}"
SERVICE_USER="${GYDS_SERVICE_USER:-gyds}"
HEALTH_TIMEOUT="${GYDS_HEALTH_TIMEOUT:-90}"
DRY_RUN=0

log()  { printf '[GYDS installer] %s\n' "$*"; }
warn() { printf '[GYDS installer] WARNING: %s\n' "$*" >&2; }
die()  { printf '[GYDS installer] ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Install or safely update the canonical GYDS Go fullnode service.

Options:
  --app-dir PATH     Canonical source checkout (default: /opt/gyds-fullnode)
  --bin-dir PATH     Binary directory for a new service (default: /usr/local/bin)
  --data-dir PATH    Chain data directory for a new service
  --dry-run          Print the scope without changing the system
  -h, --help         Show this help

Environment overrides:
  GYDS_APP_DIR, GYDS_BIN, GYDS_DATA_DIR, GYDS_SERVICE_USER,
  GYDS_HEALTH_TIMEOUT, GYDS_BOOTSTRAP_NODES

The installer fast-forwards only from https://github.com/hc172808/fullnode.git.
It refuses dirty source checkouts and never resets local source changes.
Existing systemd settings and chain data are left in place. For a new service,
RPC and dashboard bind to 127.0.0.1 by default. A temporary build-worktree
hardening call is used if upstream full-node code does not bind locally.
Existing service binding is preserved. No firewall rules are changed.
EOF
}

while (($#)); do
  case "$1" in
    --app-dir)
      (($# >= 2)) || die "--app-dir needs a path"
      APP_DIR="$2"
      shift 2
      ;;
    --bin-dir)
      (($# >= 2)) || die "--bin-dir needs a path"
      BIN_DIR="$2"
      shift 2
      ;;
    --data-dir)
      (($# >= 2)) || die "--data-dir needs a path"
      DATA_DIR_OVERRIDE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

if ((DRY_RUN)); then
  log "Would install/update only the Go fullnode from $REPO_URL (branch $BRANCH)."
  log "Would leave the dashboard application, database, existing service settings, and chain data alone."
  log "New-service RPC/dashboard listeners bind to localhost; existing listener bindings are preserved."
  log "Would not change firewall rules or create a public RPC listener."
  exit 0
fi

[[ $EUID -eq 0 ]] || die "Run as root: sudo bash $0"
[[ "$APP_DIR" == /* && "$APP_DIR" =~ ^/[A-Za-z0-9_./-]+$ && "$APP_DIR" != "/" ]] ||
  die "App directory must be an absolute path without spaces: $APP_DIR"
[[ "$BIN_DIR" == /* && "$BIN_DIR" =~ ^/[A-Za-z0-9_./-]+$ ]] ||
  die "Binary directory must be an absolute path without spaces: $BIN_DIR"
[[ "$SERVICE_USER" =~ ^[a-z_][a-z0-9_-]*[$]?$ ]] ||
  die "Invalid service user name: $SERVICE_USER"
[[ "$HEALTH_TIMEOUT" =~ ^[1-9][0-9]*$ ]] ||
  die "GYDS_HEALTH_TIMEOUT must be a positive whole number of seconds"

command -v systemctl >/dev/null 2>&1 || die "systemd is required for this installer"

TMP_DIR=""
BUILD_SOURCE=""
STAGED_BINARY=""
NEW_UNIT=0
CREATE_ENV_FILE=0
APPEND_DATA_DIR=0
HAS_EXISTING_UNIT=0
LOOPBACK_PATCHED=0
UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
BACKUP_BINARY=""
BINARY_PATH=""
SERVICE_GROUP=""

git_app() {
  git -c "safe.directory=$APP_DIR" -C "$APP_DIR" "$@"
}

cleanup() {
  if [[ -n "$BUILD_SOURCE" && -d "$BUILD_SOURCE" && -d "$APP_DIR/.git" ]]; then
    git_app worktree remove --force "$BUILD_SOURCE" >/dev/null 2>&1 || true
  fi
  if [[ -n "$STAGED_BINARY" ]]; then
    rm -f -- "$STAGED_BINARY"
  fi
  if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then
    rm -rf -- "$TMP_DIR"
  fi
  return 0
}
trap cleanup EXIT

install_system_packages() {
  # Install only build/download prerequisites. No firewall, web-server,
  # database, or application packages are installed here.
  [[ -r /etc/os-release ]] || die "Cannot identify the operating system"
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}" in
    ubuntu|debian)
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -qq
      apt-get install -y --no-install-recommends \
        build-essential ca-certificates curl git python3 tar util-linux
      ;;
    rhel|centos|rocky|almalinux|fedora)
      if command -v dnf >/dev/null 2>&1; then
        dnf install -y gcc gcc-c++ make ca-certificates curl git python3 tar util-linux
      elif command -v yum >/dev/null 2>&1; then
        yum install -y gcc gcc-c++ make ca-certificates curl git python3 tar util-linux
      else
        die "Neither dnf nor yum is available"
      fi
      ;;
    *)
      die "Unsupported OS '${ID:-unknown}'. Use Ubuntu, Debian, RHEL, CentOS, Rocky, AlmaLinux, or Fedora."
      ;;
  esac
}

verify_origin() {
  local origin
  origin="$(git_app remote get-url origin 2>/dev/null || true)"
  case "$origin" in
    https://github.com/hc172808/fullnode.git|https://github.com/hc172808/fullnode|\
    git@github.com:hc172808/fullnode.git|git@github.com:hc172808/fullnode|\
    ssh://git@github.com/hc172808/fullnode.git|ssh://git@github.com/hc172808/fullnode)
      ;;
    *)
      die "Refusing source checkout with non-canonical origin: ${origin:-<missing>}"
      ;;
  esac
}

prepare_checkout() {
  install -d -m 0755 "$(dirname "$APP_DIR")"

  if [[ -L "$APP_DIR" ]]; then
    die "Refusing to use a symlink as the source directory: $APP_DIR"
  fi

  if [[ -e "$APP_DIR" && ! -d "$APP_DIR" ]]; then
    die "Source path exists but is not a directory: $APP_DIR"
  fi

  if [[ -d "$APP_DIR" && ! -d "$APP_DIR/.git" ]]; then
    if [[ -z "$(find "$APP_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
      rmdir "$APP_DIR"
    else
      die "Source path is non-empty but is not a Git checkout: $APP_DIR"
    fi
  fi

  if [[ ! -d "$APP_DIR/.git" ]]; then
    local staged_checkout="$TMP_DIR/initial-checkout"
    log "Cloning canonical source into $APP_DIR..."
    git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$staged_checkout"
    APP_DIR="$(realpath -m "$APP_DIR")"
    mv -- "$staged_checkout" "$APP_DIR"
  fi

  verify_origin
  local current_branch
  current_branch="$(git_app branch --show-current)"
  [[ "$current_branch" == "$BRANCH" ]] ||
    die "Checkout is on '$current_branch', not '$BRANCH'; switch it to main manually."

  local changes
  changes="$(git_app status --porcelain --untracked-files=all)"
  [[ -z "$changes" ]] ||
    die "Source checkout has local or untracked changes. Commit or move them before installing."

  OLD_SHA="$(git_app rev-parse HEAD)"
  log "Fetching $REPO_URL ($BRANCH)..."
  git_app fetch --prune origin "$BRANCH"
  git_app show-ref --verify --quiet "refs/remotes/origin/$BRANCH" ||
    die "Canonical remote branch origin/$BRANCH was not found"
  NEW_SHA="$(git_app rev-parse "origin/$BRANCH")"

  git_app merge-base --is-ancestor "$OLD_SHA" "$NEW_SHA" ||
    die "Canonical update is not a fast-forward. Review the source history manually."

  BUILD_SOURCE="$TMP_DIR/source"
  git_app worktree add --detach "$BUILD_SOURCE" "$NEW_SHA"
  log "Source: ${OLD_SHA:0:12} -> ${NEW_SHA:0:12}"
}

version_at_least() {
  local required="$1" installed="$2"
  [[ "$(printf '%s\n%s\n' "$required" "$installed" | sort -V | head -n 1)" == "$required" ]]
}

install_go_toolchain() {
  local go_line toolchain_line go_required current_go arch releases_json archive sha256 target_go

  go_line="$(awk '$1 == "go" { print $2; exit }' "$BUILD_SOURCE/go.mod")"
  toolchain_line="$(awk '$1 == "toolchain" { sub(/^go/, "", $2); print $2; exit }' "$BUILD_SOURCE/go.mod")"
  go_required="${toolchain_line:-$go_line}"
  [[ "$go_required" =~ ^[0-9]+\.[0-9]+$ ]] && go_required="${go_required}.0"
  [[ "$go_required" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] ||
    die "Could not read a supported Go version from go.mod: ${go_required:-missing}"

  if command -v go >/dev/null 2>&1; then
    current_go="$(go version | awk '{ sub(/^go/, "", $3); print $3 }')"
    if [[ "$current_go" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] &&
       version_at_least "$go_required" "$current_go"; then
      GO_BIN="$(command -v go)"
      log "Using installed Go $current_go"
      return
    fi
  fi

  target_go="/opt/golang/go${go_required}"
  if [[ -x "$target_go/bin/go" ]]; then
    current_go="$("$target_go/bin/go" version | awk '{ sub(/^go/, "", $3); print $3 }')"
    version_at_least "$go_required" "$current_go" ||
      die "Existing toolchain at $target_go is too old; refusing to replace it."
    GO_BIN="$target_go/bin/go"
    log "Using isolated Go toolchain $current_go"
    return
  elif [[ -e "$target_go" ]]; then
    die "Go toolchain path exists but is not a valid installation: $target_go"
  fi

  case "$(uname -m)" in
    x86_64) arch="amd64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) die "Unsupported CPU architecture: $(uname -m)" ;;
  esac

  log "Installing isolated Go $go_required toolchain (system Go will not be replaced)..."
  releases_json="$TMP_DIR/go-releases.json"
  curl --fail --silent --show-error --location \
    "https://go.dev/dl/?mode=json&include=all" -o "$releases_json"
  read -r archive sha256 < <(
    python3 - "$releases_json" "$go_required" "$arch" <<'PY'
import json
import sys

path, required, arch = sys.argv[1:]
with open(path, encoding="utf-8") as source:
    releases = json.load(source)
version = f"go{required}"
release = next((item for item in releases if item.get("version") == version), None)
if release is None:
    raise SystemExit(f"Go release {version} is not listed by go.dev")
entry = next(
    (
        item for item in release.get("files", [])
        if item.get("os") == "linux"
        and item.get("arch") == arch
        and item.get("kind") == "archive"
    ),
    None,
)
if entry is None:
    raise SystemExit(f"No Linux {arch} archive for {version}")
print(entry["filename"], entry["sha256"], sep="\t")
PY
  )
  [[ -n "$archive" && "$sha256" =~ ^[0-9a-f]{64}$ ]] ||
    die "Could not obtain the official Go download checksum"

  local archive_path="$TMP_DIR/$archive"
  curl --fail --silent --show-error --location \
    "https://go.dev/dl/$archive" -o "$archive_path"
  printf '%s  %s\n' "$sha256" "$archive_path" | sha256sum --check --status ||
    die "Go archive checksum verification failed"

  mkdir -p /opt/golang
  tar -xzf "$archive_path" -C "$TMP_DIR"
  install -d -m 0755 "$target_go"
  cp -a "$TMP_DIR/go/." "$target_go/"
  GO_BIN="$target_go/bin/go"
  [[ "$("$GO_BIN" version)" == *"go${go_required}"* ]] ||
    die "Installed Go toolchain version check failed"
}

apply_new_service_loopback_hardening() {
  local source_file="$BUILD_SOURCE/main.go"

  if awk '
    /^func runFullNode\(/ { inside=1; next }
    inside && /^func / { exit }
    inside && /SetLoopbackOnly\(\)/ { found=1 }
    END { exit !found }
  ' "$source_file"; then
    log "Canonical fullnode already binds its listeners to loopback."
    return
  fi

  grep -Fq 'func (s *Server) SetLoopbackOnly()' "$BUILD_SOURCE/rpc/server.go" ||
    die "Canonical source has no safe loopback-only listener API; refusing a fresh service install."

  log "Applying a temporary loopback-only listener hardening to the build worktree..."
  python3 - "$source_file" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
source = path.read_text(encoding="utf-8")
start = source.find("func runFullNode(")
if start < 0:
    raise SystemExit("runFullNode function was not found")
end = source.find("\nfunc ", start + 1)
if end < 0:
    end = len(source)
body = source[start:end]
if "SetLoopbackOnly()" in body:
    raise SystemExit("loopback binding state changed during patching")

needle = "rpcSrv.SetNodeMode(cfg.NodeMode)"
if body.count(needle) != 1:
    raise SystemExit("could not identify the fullnode RPC server setup safely")
index = body.index(needle)
line_start = body.rfind("\n", 0, index) + 1
indent = body[line_start:index]
if indent.strip():
    raise SystemExit("unexpected formatting before the fullnode RPC setup")

body = body[:line_start] + indent + "rpcSrv.SetLoopbackOnly()\n" + body[line_start:]
path.write_text(source[:start] + body + source[end:], encoding="utf-8")
PY
  LOOPBACK_PATCHED=1
}

read_env_value() {
  local key="$1" file="$2" line value
  [[ -f "$file" ]] || return 0
  line="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 0
  value="${line#*=}"
  value="${value#\"}"; value="${value%\"}"
  value="${value#\'}"; value="${value%\'}"
  printf '%s' "$value"
}

service_env_value() {
  local key="$1" properties
  properties="$(systemctl show "$SERVICE_NAME" --property=Environment --value 2>/dev/null || true)"
  tr ' ' '\n' <<<"$properties" | sed -n "s/^${key}=//p" | tail -n 1
}

valid_port() {
  [[ "$1" =~ ^[0-9]{1,5}$ ]] && ((10#$1 >= 1 && 10#$1 <= 65535))
}

install_system_packages
command -v git >/dev/null 2>&1 || die "git installation failed"
command -v curl >/dev/null 2>&1 || die "curl installation failed"
command -v python3 >/dev/null 2>&1 || die "python3 installation failed"
command -v sha256sum >/dev/null 2>&1 || die "sha256sum is required"
command -v flock >/dev/null 2>&1 || die "flock is required"

install -d -m 0755 /run/lock
exec 9>"$LOCK_FILE"
flock -n 9 || die "Another GYDS fullnode installation is running"

TMP_DIR="$(mktemp -d /tmp/gyds-fullnode-install.XXXXXX)"
prepare_checkout
if systemctl cat "$SERVICE_NAME" >/dev/null 2>&1; then
  HAS_EXISTING_UNIT=1
fi
if ((HAS_EXISTING_UNIT)); then
  log "Existing native service found; its current listener binding will be preserved."
else
  log "Preparing a fresh service with loopback-only RPC/dashboard listeners."
  apply_new_service_loopback_hardening
fi
install_go_toolchain

log "Running canonical Go tests..."
(
  cd "$BUILD_SOURCE"
  GOTOOLCHAIN=local "$GO_BIN" mod download
  GOTOOLCHAIN=local "$GO_BIN" test ./...
)

local_version="${NEW_SHA:0:12}"
if ((LOOPBACK_PATCHED)); then
  local_version="${local_version}-local-loopback"
fi
STAGED_BINARY="$TMP_DIR/gyds-fullnode"
log "Building fullnode binary for ${local_version}..."
(
  cd "$BUILD_SOURCE"
  GOTOOLCHAIN=local "$GO_BIN" build \
    -ldflags="-s -w -X main.version=${local_version}" \
    -o "$STAGED_BINARY" .
)
chmod 0755 "$STAGED_BINARY"

# Do not change the existing service definition. Place the new binary at the
# exact executable path already used by the service, or create a small native
# service for a fresh installation.
UNIT_TEXT=""
if systemctl cat "$SERVICE_NAME" >/dev/null 2>&1; then
  ((HAS_EXISTING_UNIT)) ||
    die "A $SERVICE_NAME unit appeared during installation; rerun to preserve its settings."
  UNIT_TEXT="$(systemctl cat "$SERVICE_NAME")"
  if systemctl is-active --quiet gyds-fullnode-compose 2>/dev/null; then
    die "A Docker Compose fullnode is active; this script only manages the native systemd service."
  fi

  current_mode="$(service_env_value GYDS_NODE_MODE)"
  current_mode="${current_mode:-$(read_env_value GYDS_NODE_MODE "$ENV_FILE")}"
  if [[ -n "$current_mode" && "$current_mode" != "full" ]]; then
    die "The existing $SERVICE_NAME unit uses GYDS_NODE_MODE=$current_mode, not full; refusing to change it."
  fi

  exec_property="$(systemctl show "$SERVICE_NAME" --property=ExecStart --value 2>/dev/null || true)"
  BINARY_PATH="$(sed -n 's/.*path=\([^ ;]*\).*/\1/p' <<<"$exec_property" | head -n 1)"
  if [[ -z "$BINARY_PATH" ]]; then
    exec_line="$(sed -n 's/^[[:space:]]*ExecStart=//p' <<<"$UNIT_TEXT" | tail -n 1)"
    BINARY_PATH="${exec_line%%[[:space:]]*}"
    BINARY_PATH="${BINARY_PATH#-}"
    BINARY_PATH="${BINARY_PATH#+}"
    BINARY_PATH="${BINARY_PATH#!}"
  fi
  [[ "$BINARY_PATH" == /* && "$(basename "$BINARY_PATH")" == "gyds-fullnode" ]] ||
    die "Cannot safely identify the executable used by $SERVICE_NAME; review its ExecStart manually."
  [[ ! -L "$BINARY_PATH" ]] ||
    die "Service executable is a symlink ($BINARY_PATH); refusing to replace it."
else
  (( ! HAS_EXISTING_UNIT )) ||
    die "The existing $SERVICE_NAME unit disappeared during installation; refusing to create a replacement."
  BINARY_PATH="${BIN_DIR%/}/gyds-fullnode"
  [[ ! -L "$BINARY_PATH" ]] ||
    die "Refusing to replace a symlink at $BINARY_PATH"
fi

# Ensure main advances only after tests/build and service-mode checks have
# passed, and only if no one changed the checkout while this installation ran.
if [[ "$OLD_SHA" != "$NEW_SHA" ]]; then
  [[ "$(git_app rev-parse HEAD)" == "$OLD_SHA" ]] ||
    die "Source HEAD changed during the build; no service files were changed."
  [[ -z "$(git_app status --porcelain --untracked-files=all)" ]] ||
    die "Source checkout changed during the build; no service files were changed."
  git_app merge --ff-only "$NEW_SHA"
fi

if [[ -z "$UNIT_TEXT" ]]; then
  if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    die "$SERVICE_NAME is active but has no readable unit file; refusing to replace it."
  fi

  [[ ! -L "$ENV_FILE" ]] || die "$ENV_FILE is a symlink; refusing to change service configuration."
  configured_rpc_host="${GYDS_RPC_HOST:-$(read_env_value GYDS_RPC_HOST "$ENV_FILE")}"
  configured_rpc_host="${configured_rpc_host:-127.0.0.1}"
  [[ "$configured_rpc_host" == "127.0.0.1" ]] ||
    die "Fresh services bind RPC and dashboard to 127.0.0.1 only; other GYDS_RPC_HOST values are not supported."

  if ! getent passwd "$SERVICE_USER" >/dev/null 2>&1; then
    nologin="$(command -v nologin || printf '/usr/sbin/nologin')"
    useradd --system --user-group --home-dir /nonexistent --shell "$nologin" "$SERVICE_USER"
  fi
  SERVICE_GROUP="$(id -gn "$SERVICE_USER")"

  if [[ ! -f "$ENV_FILE" ]]; then
    DATA_DIR="${DATA_DIR_OVERRIDE:-/var/lib/gyds-fullnode}"
    [[ "$DATA_DIR" == /* && "$DATA_DIR" =~ ^/[A-Za-z0-9_./-]+$ && "$DATA_DIR" != "/" ]] ||
      die "Data directory must be an absolute path without spaces: $DATA_DIR"
    valid_port "${GYDS_RPC_PORT:-8545}" || die "Invalid GYDS_RPC_PORT"
    valid_port "${GYDS_WS_PORT:-8546}" || die "Invalid GYDS_WS_PORT"
    valid_port "${GYDS_P2P_PORT:-30303}" || die "Invalid GYDS_P2P_PORT"
    [[ "${GYDS_RPC_HOST:-127.0.0.1}" =~ ^[A-Za-z0-9.:-]+$ ]] ||
      die "GYDS_RPC_HOST contains unsupported characters"
    [[ "${GYDS_LOG_LEVEL:-info}" =~ ^[A-Za-z0-9_-]+$ ]] ||
      die "GYDS_LOG_LEVEL contains unsupported characters"
    if [[ -n "${GYDS_BOOTSTRAP_NODES:-}" &&
          ! "${GYDS_BOOTSTRAP_NODES}" =~ ^[A-Za-z0-9:./,_-]+$ ]]; then
      die "GYDS_BOOTSTRAP_NODES may contain only host:port entries separated by commas."
    fi
    CREATE_ENV_FILE=1
  else
    configured_data_dir="$(read_env_value GYDS_DATA_DIR "$ENV_FILE")"
    if [[ -n "$DATA_DIR_OVERRIDE" && -n "$configured_data_dir" &&
          "$DATA_DIR_OVERRIDE" != "$configured_data_dir" ]]; then
      die "--data-dir conflicts with GYDS_DATA_DIR in $ENV_FILE; edit the env file explicitly."
    fi
    DATA_DIR="${DATA_DIR_OVERRIDE:-${configured_data_dir:-/var/lib/gyds-fullnode}}"
    [[ -n "$configured_data_dir" ]] || APPEND_DATA_DIR=1
    [[ "$DATA_DIR" == /* && "$DATA_DIR" =~ ^/[A-Za-z0-9_./-]+$ && "$DATA_DIR" != "/" ]] ||
      die "Data directory in $ENV_FILE must be an absolute path without spaces: $DATA_DIR"
  fi

  [[ "$DATA_DIR" == /* && "$DATA_DIR" =~ ^/[A-Za-z0-9_./-]+$ && "$DATA_DIR" != "/" ]] ||
    die "Data directory must be an absolute path without spaces: $DATA_DIR"
  if [[ -d "$DATA_DIR" ]]; then
    owner="$(stat -c '%U' "$DATA_DIR")"
    [[ "$owner" == "$SERVICE_USER" ]] ||
      die "Existing data directory $DATA_DIR is owned by $owner, not $SERVICE_USER; no ownership changes were made."
  else
    install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0750 "$DATA_DIR"
  fi

  if ((CREATE_ENV_FILE)); then
    ENV_TEMP="$(mktemp /etc/gyds-fullnode.env.XXXXXX)"
    cat >"$ENV_TEMP" <<EOF
GYDS_NETWORK=mainnet
GYDS_CHAIN_ID=198282
GYDS_NODE_MODE=full
GYDS_RPC_HOST=${GYDS_RPC_HOST:-127.0.0.1}
GYDS_RPC_PORT=${GYDS_RPC_PORT:-8545}
GYDS_WS_PORT=${GYDS_WS_PORT:-8546}
GYDS_P2P_PORT=${GYDS_P2P_PORT:-30303}
GYDS_DATA_DIR=${DATA_DIR}
GYDS_LOG_LEVEL=${GYDS_LOG_LEVEL:-info}
GYDS_LOG_FORMAT=json
EOF
    if [[ -n "${GYDS_BOOTSTRAP_NODES:-}" ]]; then
      printf 'GYDS_BOOTSTRAP_NODES=%s\n' "$GYDS_BOOTSTRAP_NODES" >>"$ENV_TEMP"
    fi
    chown "root:${SERVICE_GROUP}" "$ENV_TEMP"
    chmod 0640 "$ENV_TEMP"
    mv -- "$ENV_TEMP" "$ENV_FILE"
  elif ((APPEND_DATA_DIR)); then
    install -d -m 0700 "$BACKUP_ROOT"
    cp -a -- "$ENV_FILE" "$BACKUP_ROOT/gyds-fullnode.env-$(date -u +%Y%m%d_%H%M%S).previous"
    printf '\nGYDS_DATA_DIR=%s\n' "$DATA_DIR" >>"$ENV_FILE"
  fi

  install -d -m 0755 "$(dirname "$BINARY_PATH")"
  UNIT_TEMP="$(mktemp /etc/systemd/system/${SERVICE_NAME}.service.XXXXXX)"
  cat >"$UNIT_TEMP" <<EOF
[Unit]
Description=GYDSchain Full Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_GROUP}
WorkingDirectory=${DATA_DIR}
EnvironmentFile=-${ENV_FILE}
ExecStart=${BINARY_PATH} start
Restart=on-failure
RestartSec=10
TimeoutStopSec=30
LimitNOFILE=65535
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true
ReadWritePaths=${DATA_DIR}

[Install]
WantedBy=multi-user.target
EOF
  mv -- "$UNIT_TEMP" "$UNIT_FILE"
  NEW_UNIT=1
fi

install -d -m 0755 "$(dirname "$BINARY_PATH")"
STAMP="$(date -u +%Y%m%d_%H%M%S)"
install -d -m 0700 "$BACKUP_ROOT"
if [[ -f "$BINARY_PATH" ]]; then
  BACKUP_BINARY="$BACKUP_ROOT/gyds-fullnode-${STAMP}.previous"
  cp -a -- "$BINARY_PATH" "$BACKUP_BINARY"
fi

STAGED_INSTALL="${BINARY_PATH}.new.$$"
install -m 0755 -o root -g root "$STAGED_BINARY" "$STAGED_INSTALL"
mv -f -- "$STAGED_INSTALL" "$BINARY_PATH"
STAGED_BINARY="$STAGED_INSTALL"

if ((NEW_UNIT)); then
  if command -v systemd-analyze >/dev/null 2>&1; then
    systemd-analyze verify "$UNIT_FILE" ||
      die "Generated systemd unit failed validation: $UNIT_FILE"
  fi
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
fi

if systemctl is-active --quiet "$SERVICE_NAME"; then
  log "Restarting $SERVICE_NAME (RPC will be briefly unavailable)..."
  if ! systemctl restart "$SERVICE_NAME"; then
    if [[ -n "$BACKUP_BINARY" && -f "$BACKUP_BINARY" ]]; then
      install -m 0755 -o root -g root "$BACKUP_BINARY" "$BINARY_PATH"
      systemctl restart "$SERVICE_NAME" || true
      die "Service restart failed. Restored the previous binary; check journalctl -u $SERVICE_NAME."
    fi
    die "Initial service restart failed; check journalctl -u $SERVICE_NAME."
  fi
else
  log "Starting $SERVICE_NAME..."
  if ! systemctl start "$SERVICE_NAME"; then
    if [[ -n "$BACKUP_BINARY" && -f "$BACKUP_BINARY" ]]; then
      install -m 0755 -o root -g root "$BACKUP_BINARY" "$BINARY_PATH"
      systemctl start "$SERVICE_NAME" || true
      die "Service start failed. Restored the previous binary; check journalctl -u $SERVICE_NAME."
    fi
    die "Initial service start failed; check journalctl -u $SERVICE_NAME."
  fi
fi

rpc_port="$(service_env_value GYDS_RPC_PORT)"
rpc_port="${rpc_port:-$(read_env_value GYDS_RPC_PORT "$ENV_FILE")}"
rpc_port="${rpc_port:-8545}"
rpc_host="$(service_env_value GYDS_RPC_HOST)"
rpc_host="${rpc_host:-$(read_env_value GYDS_RPC_HOST "$ENV_FILE")}"
rpc_host="${rpc_host:-127.0.0.1}"
case "$rpc_host" in
  0.0.0.0) rpc_host="127.0.0.1" ;;
  ::) rpc_host="::1" ;;
esac
if [[ "$rpc_host" == *:* && "$rpc_host" != \[*\] ]]; then
  health_url="http://[${rpc_host}]:${rpc_port}/health"
else
  health_url="http://${rpc_host}:${rpc_port}/health"
fi

healthy=0
deadline=$((SECONDS + HEALTH_TIMEOUT))
while ((SECONDS < deadline)); do
  if systemctl is-active --quiet "$SERVICE_NAME" &&
     curl --fail --silent --show-error --max-time 3 "$health_url" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 2
done

if (( ! healthy )); then
  warn "The service did not pass its active/RPC health check."
  if [[ -n "$BACKUP_BINARY" && -f "$BACKUP_BINARY" ]]; then
    install -m 0755 -o root -g root "$BACKUP_BINARY" "$BINARY_PATH"
    systemctl restart "$SERVICE_NAME" || true
    die "Restored the previous binary. Check journalctl -u $SERVICE_NAME."
  fi
  systemctl stop "$SERVICE_NAME" || true
  die "Initial service did not become healthy. Binary and configuration were kept for diagnosis; check journalctl -u $SERVICE_NAME."
fi

log "Fullnode is healthy at source ${NEW_SHA:0:12}."
if ((LOOPBACK_PATCHED)); then
  log "The temporary loopback-only listener hardening was applied only to the build worktree; canonical source stays unmodified."
fi
log "Service: systemctl status $SERVICE_NAME"
log "Logs:    journalctl -u $SERVICE_NAME -f"
log "Data directory was not deleted, moved, or reset."
log "Backups of replaced binaries: $BACKUP_ROOT"
log "No firewall rules were changed; existing listener bindings were preserved."
