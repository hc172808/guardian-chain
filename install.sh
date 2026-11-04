#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  ChainCore / GYDSchain — Master Installer v2.0.0                           ║
# ║  One-command entry point for any server setup scenario.                    ║
# ║                                                                              ║
# ║  Supported OS:                                                              ║
# ║    • Ubuntu 20.04 / 22.04 / 24.04 LTS  (recommended)                      ║
# ║    • Debian 11 / 12                                                         ║
# ║    • CentOS / Rocky / AlmaLinux 8 & 9                                      ║
# ║    • Fedora 38+                                                             ║
# ║                                                                              ║
# ║  Usage:                                                                      ║
# ║    sudo bash install.sh                      # interactive menu             ║
# ║    sudo bash install.sh --dashboard          # dashboard only               ║
# ║    sudo bash install.sh --requirements       # system deps only             ║
# ║    sudo bash install.sh --fullnode           # full blockchain node         ║
# ║    sudo bash install.sh --all                # everything                   ║
# ║    sudo bash install.sh --dashboard --noninteractive # unattended          ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()   { echo -e "${YELLOW}[!]${NC} $*"; }
err()    { echo -e "${RED}[✗]${NC} $*" >&2; }
info()   { echo -e "${CYAN}[→]${NC} $*"; }
step()   { echo ""; echo -e "${BOLD}${GREEN}━━━ $* ━━━${NC}"; }

# ─── OS detection ─────────────────────────────────────────────────────────────
if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  source /etc/os-release
  OS_NAME="${PRETTY_NAME:-unknown}"
else
  OS_NAME="$(uname -s)"
fi

# ─── Argument parsing ─────────────────────────────────────────────────────────
MODE=""
NONINTERACTIVE="${NONINTERACTIVE:-0}"
REQUIREMENT_ARGS=()

select_mode() {
  if [[ -n "$MODE" && "$MODE" != "$1" ]]; then
    err "Choose only one installation mode (received $MODE and $1)."
    exit 1
  fi
  MODE="$1"
}

for arg in "$@"; do
  case "$arg" in
    --requirements|-r) select_mode requirements ;;
    --dashboard|-d)    select_mode dashboard ;;
    --fullnode)        select_mode fullnode ;;
    --litenode)        select_mode litenode ;;
    --validator)       select_mode validator ;;
    --rpc)             select_mode rpc ;;
    --bootnode)        select_mode bootnode ;;
    --genesis)         select_mode genesis ;;
    --all|-a)          select_mode all ;;
    --redeploy)        select_mode redeploy ;;
    --minimal|--no-docker|--no-go|--no-wireguard|--certbot|--pg-client-only)
      REQUIREMENT_ARGS+=("$arg") ;;
    --noninteractive|--non-interactive) NONINTERACTIVE=1 ;;
    -h|--help)
      sed -n '3,18p' "$0" | sed 's/^# //' | sed 's/^#//'
      echo "  --redeploy                 Update an existing installation"
      echo "  --noninteractive           Skip prompts (requires a mode)"
      echo "  --requirements options: --minimal --no-docker --no-go --no-wireguard --certbot --pg-client-only"
      exit 0 ;;
    *) err "Unknown flag: $arg. Use --help for supported options."; exit 1 ;;
  esac
done

[[ "$NONINTERACTIVE" =~ ^[01]$ ]] || { err "NONINTERACTIVE must be 0 or 1."; exit 1; }
export NONINTERACTIVE
if [[ "$NONINTERACTIVE" == "1" && -z "$MODE" ]]; then
  err "No mode selected. Use --help for usage."
  exit 1
fi
if [[ "$NONINTERACTIVE" != "1" && ! -t 0 ]]; then
  err "No interactive terminal. Supply a mode and --noninteractive."
  exit 1
fi

# ─── Root check (help is available without sudo) ───────────────────────────────
[[ $EUID -eq 0 ]] || { err "Run as root:  sudo bash install.sh $*"; exit 1; }

# ─── Banner ───────────────────────────────────────────────────────────────────
clear 2>/dev/null || true
echo -e "${BOLD}${CYAN}"
cat << 'BANNER'
  ██████╗ ██╗   ██╗██████╗ ███████╗     ██████╗██╗  ██╗ █████╗ ██╗███╗   ██╗
 ██╔════╝ ╚██╗ ██╔╝██╔══██╗██╔════╝    ██╔════╝██║  ██║██╔══██╗██║████╗  ██║
 ██║  ███╗ ╚████╔╝ ██║  ██║███████╗    ██║     ███████║███████║██║██╔██╗ ██║
 ██║   ██║  ╚██╔╝  ██║  ██║╚════██║    ██║     ██╔══██║██╔══██║██║██║╚██╗██║
 ╚██████╔╝   ██║   ██████╔╝███████║    ╚██████╗██║  ██║██║  ██║██║██║ ╚████║
  ╚═════╝    ╚═╝   ╚═════╝ ╚══════╝     ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝
BANNER
echo -e "${NC}"
echo -e "  ${BOLD}ChainCore / GYDSchain — Master Installer v2.0.0${NC}"
echo -e "  Chain ID: ${CYAN}198282${NC}  |  OS: ${CYAN}${OS_NAME}${NC}"
echo -e "  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo ""

# ─── Interactive menu (if no mode flag given) ─────────────────────────────────
if [[ -z "$MODE" && "$NONINTERACTIVE" != "1" ]]; then
  echo -e "  ${BOLD}What would you like to install?${NC}"
  echo ""
  echo -e "  ${GREEN}[1]${NC}  System requirements only — does not deploy the dashboard"
  echo -e "       (The default Nginx welcome page remains until you choose option 2)"
  echo -e "       (Node.js, npm, PM2, PostgreSQL, Nginx, UFW, fail2ban, Go, Docker, WireGuard)"
  echo ""
  echo -e "  ${GREEN}[2]${NC}  ChainCore Dashboard"
  echo -e "       (Full web dashboard + API server + database + Nginx — installs requirements first)"
  echo ""
  echo -e "  ${GREEN}[3]${NC}  Blockchain nodes — pick which type(s):"
  echo -e "       [3a] Full node + RPC      (stores full chain state, serves JSON-RPC)"
  echo -e "       [3b] Lite node            (light client, minimal storage)"
  echo -e "       [3c] Validator node       (participates in PoS consensus)"
  echo -e "       [3d] RPC node             (dedicated JSON-RPC endpoint)"
  echo -e "       [3e] Bootnode             (peer discovery only)"
  echo -e "       [3f] Genesis node         (network genesis/bootstrap)"
  echo ""
  echo -e "  ${GREEN}[4]${NC}  Everything (requirements + dashboard + all nodes)"
  echo ""
  echo -e "  ${GREEN}[5]${NC}  Update / redeploy existing installation"
  echo ""
  echo -e "  ${RED}[q]${NC}  Quit"
  echo ""
  read -rp "  Your choice: " MENU_CHOICE
  echo ""

  case "$MENU_CHOICE" in
    1)   MODE="requirements" ;;
    2)   MODE="dashboard" ;;
    3)
      echo -e "  ${BOLD}Node types (enter sub-option, e.g. 3a or 3b):${NC}"
      read -rp "  Sub-choice: " MENU_SUB
      case "$MENU_SUB" in
        3a|a) MODE="fullnode" ;;
        3b|b) MODE="litenode" ;;
        3c|c) MODE="validator" ;;
        3d|d) MODE="rpc" ;;
        3e|e) MODE="bootnode" ;;
        3f|f) MODE="genesis" ;;
        *)    err "Unknown sub-choice: $MENU_SUB"; exit 1 ;;
      esac
      ;;
    4)  MODE="all" ;;
    5)  MODE="redeploy" ;;
    q|Q) echo "Aborted."; exit 0 ;;
    *)  err "Invalid choice: $MENU_CHOICE"; exit 1 ;;
  esac
fi

[[ -n "$MODE" ]] || { err "No mode selected. Use --help for usage."; exit 1; }
if (( ${#REQUIREMENT_ARGS[@]} > 0 )) && [[ "$MODE" != "requirements" ]]; then
  err "Requirements options can only be used with --requirements."
  exit 1
fi

# ─── Helper: resolve script path ──────────────────────────────────────────────
find_script() {
  local name="$1"
  local locations=(
    "${SCRIPT_DIR}/public/scripts/${name}"
    "${SCRIPT_DIR}/scripts/${name}"
    "/var/www/gydschain/public/scripts/${name}"
    "/opt/gydschain/public/scripts/${name}"
  )
  for loc in "${locations[@]}"; do
    [[ -f "$loc" ]] && { echo "$loc"; return 0; }
  done
  echo ""
  return 1
}

require_script() {
  local path
  path=$(find_script "$1") || {
    err "Script not found: $1"
    err "Expected in: ${SCRIPT_DIR}/public/scripts/ or ${SCRIPT_DIR}/scripts/"
    return 1
  }
  printf '%s\n' "$path"
}

run_script() {
  local script="$1"; shift
  local path
  path=$(find_script "$script" || true)
  if [[ -z "$path" ]]; then
    err "Script not found: $script"
    err "Expected in: ${SCRIPT_DIR}/public/scripts/ or ${SCRIPT_DIR}/scripts/"
    exit 1
  fi
  info "Running: $path $*"
  bash "$path" "$@"
}

# Validate every dependency before installing packages or changing services.
case "$MODE" in
  requirements) require_script "requirements.sh" >/dev/null ;;
  dashboard)
    require_script "requirements.sh" >/dev/null
    require_script "deploy-dashboard.sh" >/dev/null ;;
  all)
    require_script "requirements.sh" >/dev/null
    require_script "deploy-dashboard.sh" >/dev/null
    require_script "install-all-nodes.sh" >/dev/null ;;
  fullnode|litenode|validator|rpc|bootnode|genesis)
    require_script "requirements.sh" >/dev/null
    NODE_SCRIPT="install-${MODE}.sh"
    case "$MODE" in
      validator) NODE_SCRIPT="install-validatornode.sh" ;;
      rpc) NODE_SCRIPT="install-rpcnode.sh" ;;
    esac
    require_script "$NODE_SCRIPT" >/dev/null ;;
  redeploy)
    if ! command -v gyds-redeploy >/dev/null 2>&1; then
      require_script "redeploy.sh" >/dev/null
    fi ;;
esac
REQ_SCRIPT=$(find_script "requirements.sh" || true)
# Do not print the failing command: it could contain credentials.
trap 'status=$?; err "Installation failed during $MODE (line $LINENO, exit $status). Review the preceding error; installation is incomplete."; exit "$status"' ERR

# ─── Execute chosen mode ──────────────────────────────────────────────────────
case "$MODE" in

  # ── 1. Requirements only ───────────────────────────────────────────────────
  requirements)
    step "Installing system requirements"
    NONINTERACTIVE="$NONINTERACTIVE" bash "$REQ_SCRIPT" "${REQUIREMENT_ARGS[@]}"
    ;;

  # ── 2. Dashboard ───────────────────────────────────────────────────────────
  dashboard)
    step "Installing requirements + ChainCore Dashboard"

    # Install requirements first
    if [[ -f "$REQ_SCRIPT" ]]; then
      info "Step 1/2 — System requirements"
      NONINTERACTIVE="$NONINTERACTIVE" bash "$REQ_SCRIPT" --minimal
    fi

    info "Step 2/2 — ChainCore Dashboard"
    DEPLOY_SCRIPT=$(find_script "deploy-dashboard.sh")
    [[ -n "$DEPLOY_SCRIPT" ]] || { err "deploy-dashboard.sh not found"; exit 1; }
    NONINTERACTIVE="$NONINTERACTIVE" bash "$DEPLOY_SCRIPT"
    ;;

  # ── 3. Individual node types ───────────────────────────────────────────────
  fullnode)
    step "Installing requirements + Full Node"
    NONINTERACTIVE="$NONINTERACTIVE" bash "$REQ_SCRIPT" --no-docker
    run_script "install-fullnode.sh"
    ;;

  litenode)
    step "Installing requirements + Lite Node"
    NONINTERACTIVE="$NONINTERACTIVE" bash "$REQ_SCRIPT" --no-docker --no-wireguard
    run_script "install-litenode.sh"
    ;;

  validator)
    step "Installing requirements + Validator Node"
    NONINTERACTIVE="$NONINTERACTIVE" bash "$REQ_SCRIPT"
    run_script "install-validatornode.sh"
    ;;

  rpc)
    step "Installing requirements + RPC Node"
    NONINTERACTIVE="$NONINTERACTIVE" bash "$REQ_SCRIPT" --no-docker
    run_script "install-rpcnode.sh"
    ;;

  bootnode)
    step "Installing requirements + Bootnode"
    NONINTERACTIVE="$NONINTERACTIVE" bash "$REQ_SCRIPT" --no-docker
    run_script "install-bootnode.sh"
    ;;

  genesis)
    step "Installing requirements + Genesis Node"
    NONINTERACTIVE="$NONINTERACTIVE" bash "$REQ_SCRIPT"
    run_script "install-genesis.sh"
    ;;

  # ── 4. Everything ──────────────────────────────────────────────────────────
  all)
    step "Full installation — requirements + dashboard + all node types"
    warn "This will install ALL components. This may take 15-30 minutes."

    if [[ "$NONINTERACTIVE" != "1" ]]; then
      read -rp "Continue? (y/N) " -n 1 _all_ok; echo
      [[ "$_all_ok" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
    fi

    info "1/3 — System requirements"
    NONINTERACTIVE=1 bash "$REQ_SCRIPT"

    info "2/3 — ChainCore Dashboard"
    DEPLOY_SCRIPT=$(find_script "deploy-dashboard.sh")
    if [[ -n "$DEPLOY_SCRIPT" ]]; then
      NONINTERACTIVE=1 bash "$DEPLOY_SCRIPT"
    else
      err "deploy-dashboard.sh not found — cannot complete the dashboard installation"
      exit 1
    fi

    info "3/3 — All node types"
    ALL_NODES_SCRIPT=$(find_script "install-all-nodes.sh")
    if [[ -z "$ALL_NODES_SCRIPT" ]]; then
      err "install-all-nodes.sh was not found; the dashboard is installed, but node installation did not run."
      exit 1
    fi
    if ! NONINTERACTIVE=1 bash "$ALL_NODES_SCRIPT" --all; then
      err "Node installation failed. The dashboard was installed first; check the node installer output and logs."
      exit 1
    fi
    ;;

  # ── 5. Redeploy / update ────────────────────────────────────────────────────
  redeploy)
    step "Redeploying / updating existing installation"
    if command -v gyds-redeploy &>/dev/null; then
      gyds-redeploy
    else
      REDEPLOY_SCRIPT=$(find_script "redeploy.sh")
      [[ -n "$REDEPLOY_SCRIPT" ]] || { err "redeploy.sh not found and gyds-redeploy not installed"; exit 1; }
      bash "$REDEPLOY_SCRIPT"
    fi
    ;;

  *)
    err "Unknown mode: $MODE"
    exit 1
    ;;
esac

echo ""
if [[ "$MODE" == "requirements" ]]; then
  log "System requirements installed — the dashboard has NOT been deployed."
  info "To install the dashboard and replace the Nginx welcome page, run:"
  echo "  sudo bash \"$SCRIPT_DIR/install.sh\" --dashboard"
else
  log "Installation complete — $(date '+%Y-%m-%d %H:%M:%S')"
fi
