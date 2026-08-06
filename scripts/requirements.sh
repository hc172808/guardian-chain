#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  ChainCore / GYDSchain — System Requirements Installer v2.0.0              ║
# ║  Installs ALL system-level dependencies needed to run ChainCore and/or     ║
# ║  GYDSchain blockchain nodes on a fresh server.                             ║
# ║                                                                              ║
# ║  Supported OS:                                                              ║
# ║    • Ubuntu 20.04 / 22.04 / 24.04 LTS (recommended)                       ║
# ║    • Debian 11 (Bullseye) / 12 (Bookworm)                                  ║
# ║    • CentOS / Rocky / AlmaLinux 8 & 9                                      ║
# ║    • Fedora 38+                                                             ║
# ║    • Arch Linux                                                             ║
# ║                                                                              ║
# ║  Usage:                                                                      ║
# ║    sudo bash scripts/requirements.sh                     # everything       ║
# ║    sudo bash scripts/requirements.sh --no-docker         # skip Docker      ║
# ║    sudo bash scripts/requirements.sh --no-go             # skip Go toolchain║
# ║    sudo bash scripts/requirements.sh --no-wireguard      # skip WireGuard   ║
# ║    sudo bash scripts/requirements.sh --minimal           # Node+npm+PG only ║
# ║    NONINTERACTIVE=1 sudo bash scripts/requirements.sh    # no prompts       ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -euo pipefail

# ─── Colour helpers ───────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()   { echo -e "${YELLOW}[!]${NC} $*"; }
err()    { echo -e "${RED}[✗]${NC} $*" >&2; }
info()   { echo -e "${CYAN}[→]${NC} $*"; }
step()   { echo ""; echo -e "${BOLD}${GREEN}━━━ $* ━━━${NC}"; }
banner() { echo -e "${BOLD}${CYAN}$*${NC}"; }

# ─── Root check ───────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || { err "Run as root:  sudo bash $0 $*"; exit 1; }

# ─── Argument parsing ─────────────────────────────────────────────────────────
INSTALL_DOCKER=true
INSTALL_GO=true
INSTALL_WIREGUARD=true
INSTALL_CERTBOT=false
MINIMAL=false
PG_CLIENT_ONLY=false
NONINTERACTIVE="${NONINTERACTIVE:-0}"

for arg in "$@"; do
  case "$arg" in
    --no-docker)      INSTALL_DOCKER=false ;;
    --no-go)          INSTALL_GO=false ;;
    --no-wireguard)   INSTALL_WIREGUARD=false ;;
    --certbot)        INSTALL_CERTBOT=true ;;
    --minimal)        MINIMAL=true; INSTALL_DOCKER=false; INSTALL_GO=false; INSTALL_WIREGUARD=false ;;
    --pg-client-only) PG_CLIENT_ONLY=true ;;
    --noninteractive|--non-interactive) NONINTERACTIVE=1 ;;
    -h|--help)
      sed -n '3,17p' "$0" | sed 's/^# //' | sed 's/^#//'
      exit 0 ;;
    *) warn "Unknown flag: $arg (ignored)" ;;
  esac
done

# ─── PostgreSQL client-only mode ──────────────────────────────────────────────
# Use when you need psql/pg_dump/pg_restore to connect to a REMOTE database
# without installing the full PostgreSQL server on this machine.
if $PG_CLIENT_ONLY; then
  banner "
╔══════════════════════════════════════════════════════════════════════╗
║   PostgreSQL Client Tools Installer (client-only mode)              ║
║   Installs: psql, pg_dump, pg_restore, pg_isready, createdb        ║
║   Does NOT install the PostgreSQL server                            ║
╚══════════════════════════════════════════════════════════════════════╝"

  detect_os
  pkg_update 2>/dev/null || true
  case "$PKG_FAMILY" in
    debian)
      # Add the official PostgreSQL apt repo so we get the latest client
      if ! command -v psql &>/dev/null; then
        install -d /usr/share/postgresql-common/pgdg
        curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
          | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg 2>/dev/null
        echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] \
https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
          > /etc/apt/sources.list.d/pgdg.list
        apt-get update -qq 2>/dev/null
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-client-16
      fi
      ;;
    rhel|fedora)
      dnf install -y -q postgresql 2>/dev/null || yum install -y -q postgresql 2>/dev/null || true
      ;;
    arch)
      pacman -S --noconfirm --needed postgresql-libs 2>/dev/null
      ;;
  esac

  # Test connection if DATABASE_URL is provided
  if [[ -n "${DATABASE_URL:-}" ]]; then
    echo ""
    info "Testing connection to: ${DATABASE_URL%%@*}@..."
    if psql "${DATABASE_URL}" -c "SELECT version();" 2>/dev/null; then
      log "Connection OK"
    else
      err "Connection failed — check DATABASE_URL"
      exit 1
    fi
  fi

  log "PostgreSQL client tools installed:"
  for tool in psql pg_dump pg_restore pg_isready createdb dropdb; do
    command -v "$tool" &>/dev/null && log "  ✓ $tool ($(command -v $tool))" || warn "  ✗ $tool not found"
  done

  echo ""
  echo -e "${CYAN}Usage examples:${NC}"
  echo "  Connect to DB:    psql \"\$DATABASE_URL\""
  echo "  Backup DB:        pg_dump \"\$DATABASE_URL\" -f backup.sql"
  echo "  Restore DB:       psql \"\$DATABASE_URL\" -f backup.sql"
  echo "  Check connection: pg_isready -d \"\$DATABASE_URL\""
  echo "  Run test suite:   bash scripts/test-setup.sh --db-only"
  exit 0
fi

# ─── Version pins ─────────────────────────────────────────────────────────────
NODE_MAJOR=22          # Node.js LTS major version
GO_VERSION="1.22.5"   # Go toolchain version for blockchain nodes
PM2_VERSION="latest"  # npm global PM2

# ─── OS detection ─────────────────────────────────────────────────────────────
detect_os() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    source /etc/os-release
    OS_ID="${ID:-unknown}"
    OS_VERSION="${VERSION_ID:-}"
    OS_LIKE="${ID_LIKE:-}"
  elif command -v lsb_release &>/dev/null; then
    OS_ID=$(lsb_release -si | tr '[:upper:]' '[:lower:]')
    OS_VERSION=$(lsb_release -sr)
    OS_LIKE=""
  else
    OS_ID="unknown"
    OS_VERSION=""
    OS_LIKE=""
  fi

  # Normalise families
  if [[ "$OS_ID" =~ ^(ubuntu|debian|linuxmint|pop)$ ]] || [[ "$OS_LIKE" =~ debian ]]; then
    PKG_FAMILY="debian"
  elif [[ "$OS_ID" =~ ^(centos|rhel|rocky|almalinux|ol)$ ]] || [[ "$OS_LIKE" =~ rhel ]]; then
    PKG_FAMILY="rhel"
  elif [[ "$OS_ID" == "fedora" ]]; then
    PKG_FAMILY="fedora"
  elif [[ "$OS_ID" == "arch" ]] || [[ "$OS_ID" == "manjaro" ]]; then
    PKG_FAMILY="arch"
  else
    PKG_FAMILY="unknown"
    warn "Unknown OS ($OS_ID) — proceeding with best-effort Debian-style commands"
    PKG_FAMILY="debian"
  fi
}
detect_os

# ─── Package manager wrappers ─────────────────────────────────────────────────
pkg_update() {
  case "$PKG_FAMILY" in
    debian) export DEBIAN_FRONTEND=noninteractive; apt-get update -qq ;;
    rhel)   dnf makecache -q 2>/dev/null || yum makecache -q ;;
    fedora) dnf makecache -q ;;
    arch)   pacman -Sy --noconfirm ;;
  esac
}

pkg_install() {
  case "$PKG_FAMILY" in
    debian) DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" ;;
    rhel)   dnf install -y -q "$@" 2>/dev/null || yum install -y -q "$@" ;;
    fedora) dnf install -y -q "$@" ;;
    arch)   pacman -S --noconfirm --needed "$@" ;;
  esac
}

pkg_installed() { command -v "$1" &>/dev/null || dpkg -l "$1" &>/dev/null 2>&1 || rpm -q "$1" &>/dev/null 2>&1; }

# ─── Banner ───────────────────────────────────────────────────────────────────
banner "
╔══════════════════════════════════════════════════════════════════════╗
║   ChainCore / GYDSchain — Requirements Installer v2.0.0             ║
║   OS: ${OS_ID:-unknown} ${OS_VERSION:-} (family: ${PKG_FAMILY})
║   Packages: Node.js ${NODE_MAJOR} LTS, npm, PM2, PostgreSQL 16,     ║
║             Nginx, UFW, fail2ban${INSTALL_GO:+, Go ${GO_VERSION}}${INSTALL_DOCKER:+, Docker CE}${INSTALL_WIREGUARD:+, WireGuard}${INSTALL_CERTBOT:+, certbot}
╚══════════════════════════════════════════════════════════════════════╝"

if [[ "$NONINTERACTIVE" != "1" ]]; then
  echo ""
  echo -e "  ${CYAN}What will be installed:${NC}"
  echo "    ✔ Core tools  — git, curl, wget, build-essential, openssl, jq, unzip"
  echo "    ✔ Node.js ${NODE_MAJOR} LTS + npm + PM2 (process manager)"
  echo "    ✔ PostgreSQL 16 (database)"
  echo "    ✔ Nginx (web / reverse proxy)"
  echo "    ✔ UFW firewall + fail2ban"
  $INSTALL_GO       && echo "    ✔ Go ${GO_VERSION} (blockchain node toolchain)"
  $INSTALL_DOCKER   && echo "    ✔ Docker CE + Docker Compose v2 (containerised nodes)"
  $INSTALL_WIREGUARD && echo "    ✔ WireGuard (VPN mesh)"
  $INSTALL_CERTBOT  && echo "    ✔ Certbot (Let's Encrypt SSL)"
  echo ""
  read -rp "  Continue? (y/N) " -n 1 reply; echo
  [[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
fi

INSTALL_LOG="/var/log/gydschain-requirements-install.log"
mkdir -p /var/log
echo "=== GYDSchain requirements install: $(date) ===" >> "$INSTALL_LOG"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 1 — Core system packages
# ══════════════════════════════════════════════════════════════════════════════
step "1 — Core system packages"
pkg_update 2>>"$INSTALL_LOG"

CORE_PKGS="git curl wget openssl jq unzip logrotate ca-certificates gnupg lsb-release"

case "$PKG_FAMILY" in
  debian)
    CORE_PKGS="$CORE_PKGS build-essential software-properties-common apt-transport-https"
    ;;
  rhel|fedora)
    CORE_PKGS="$CORE_PKGS gcc gcc-c++ make redhat-rpm-config"
    # EPEL for extra packages
    if ! rpm -q epel-release &>/dev/null 2>&1; then
      info "Installing EPEL repository..."
      dnf install -y -q epel-release 2>>"$INSTALL_LOG" || yum install -y -q epel-release 2>>"$INSTALL_LOG" || true
    fi
    ;;
  arch)
    CORE_PKGS="$CORE_PKGS base-devel"
    ;;
esac

pkg_install $CORE_PKGS 2>>"$INSTALL_LOG"
log "Core tools installed"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 2 — Node.js LTS
# ══════════════════════════════════════════════════════════════════════════════
step "2 — Node.js ${NODE_MAJOR} LTS"

install_nodejs_debian() {
  if ! command -v node &>/dev/null || [[ "$(node --version 2>/dev/null | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]]; then
    info "Adding NodeSource repository for Node.js ${NODE_MAJOR}..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - 2>>"$INSTALL_LOG"
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs 2>>"$INSTALL_LOG"
  else
    info "Node.js $(node --version) already installed and meets minimum version"
  fi
}

install_nodejs_rhel() {
  if ! command -v node &>/dev/null || [[ "$(node --version 2>/dev/null | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]]; then
    info "Adding NodeSource repository for Node.js ${NODE_MAJOR}..."
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash - 2>>"$INSTALL_LOG"
    dnf install -y -q nodejs 2>>"$INSTALL_LOG" || yum install -y -q nodejs 2>>"$INSTALL_LOG"
  fi
}

install_nodejs_arch() {
  if ! command -v node &>/dev/null; then
    pacman -S --noconfirm --needed nodejs npm 2>>"$INSTALL_LOG"
  fi
}

case "$PKG_FAMILY" in
  debian) install_nodejs_debian ;;
  rhel)   install_nodejs_rhel ;;
  fedora) install_nodejs_rhel ;;
  arch)   install_nodejs_arch ;;
esac

NODE_VER=$(node --version 2>/dev/null || echo "not found")
NPM_VER=$(npm --version 2>/dev/null || echo "not found")
log "Node.js ${NODE_VER} | npm ${NPM_VER}"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 3 — PM2 (process manager)
# ══════════════════════════════════════════════════════════════════════════════
step "3 — PM2 process manager"
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2@"${PM2_VERSION}" --silent 2>>"$INSTALL_LOG"
else
  # Upgrade if old
  npm install -g pm2@"${PM2_VERSION}" --silent 2>>"$INSTALL_LOG" || true
fi
log "PM2 $(pm2 --version 2>/dev/null | tail -1)"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 4 — PostgreSQL 16
# ══════════════════════════════════════════════════════════════════════════════
step "4 — PostgreSQL 16"

install_postgres_debian() {
  if ! command -v psql &>/dev/null || [[ "$(psql --version 2>/dev/null | awk '{print $3}' | cut -d. -f1)" -lt 14 ]]; then
    info "Adding official PostgreSQL apt repository..."
    install -d /usr/share/postgresql-common/pgdg
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg 2>>"$INSTALL_LOG"
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] \
https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list
    apt-get update -qq 2>>"$INSTALL_LOG"
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-16 postgresql-client-16 2>>"$INSTALL_LOG"
  else
    info "PostgreSQL $(psql --version | awk '{print $3}') already installed"
  fi
}

install_postgres_rhel() {
  if ! command -v psql &>/dev/null; then
    info "Installing PostgreSQL 16 via dnf module..."
    dnf module -y disable postgresql 2>>"$INSTALL_LOG" || true
    dnf install -y -q "https://download.postgresql.org/pub/repos/yum/reporpms/EL-$(rpm -E %rhel)-x86_64/pgdg-redhat-repo-latest.noarch.rpm" 2>>"$INSTALL_LOG" || true
    dnf install -y -q postgresql16-server postgresql16 2>>"$INSTALL_LOG"
    /usr/pgsql-16/bin/postgresql-16-setup initdb 2>>"$INSTALL_LOG" || true
  fi
}

install_postgres_arch() {
  if ! command -v psql &>/dev/null; then
    pacman -S --noconfirm --needed postgresql 2>>"$INSTALL_LOG"
    su - postgres -c "initdb -D /var/lib/postgres/data" 2>>"$INSTALL_LOG" || true
  fi
}

case "$PKG_FAMILY" in
  debian) install_postgres_debian ;;
  rhel)   install_postgres_rhel ;;
  fedora) install_postgres_rhel ;;
  arch)   install_postgres_arch ;;
esac

# Ensure PostgreSQL service is enabled and started
systemctl enable postgresql 2>>"$INSTALL_LOG" || systemctl enable postgresql-16 2>>"$INSTALL_LOG" || true
systemctl start  postgresql 2>>"$INSTALL_LOG" || systemctl start  postgresql-16 2>>"$INSTALL_LOG" || true

PSQL_VER=$(psql --version 2>/dev/null | awk '{print $3}' || echo "unknown")
log "PostgreSQL ${PSQL_VER}"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 5 — Nginx
# ══════════════════════════════════════════════════════════════════════════════
step "5 — Nginx"
if ! command -v nginx &>/dev/null; then
  case "$PKG_FAMILY" in
    debian) DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx 2>>"$INSTALL_LOG" ;;
    rhel|fedora) dnf install -y -q nginx 2>>"$INSTALL_LOG" || yum install -y -q nginx 2>>"$INSTALL_LOG" ;;
    arch) pacman -S --noconfirm --needed nginx 2>>"$INSTALL_LOG" ;;
  esac
fi
systemctl enable nginx  2>>"$INSTALL_LOG" || true
systemctl start  nginx  2>>"$INSTALL_LOG" || true
log "Nginx $(nginx -v 2>&1 | grep -o 'nginx/[0-9.]*' || echo 'installed')"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 6 — UFW Firewall + fail2ban
# ══════════════════════════════════════════════════════════════════════════════
step "6 — UFW + fail2ban"

case "$PKG_FAMILY" in
  debian)
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ufw fail2ban 2>>"$INSTALL_LOG"
    ;;
  rhel|fedora)
    dnf install -y -q ufw fail2ban 2>>"$INSTALL_LOG" || \
    yum install -y -q ufw fail2ban 2>>"$INSTALL_LOG" || \
    { warn "ufw not available via dnf — firewalld will be used as fallback"; pkg_install firewalld; }
    ;;
  arch)
    pacman -S --noconfirm --needed ufw fail2ban 2>>"$INSTALL_LOG"
    ;;
esac

# Basic UFW rules (SSH always allowed so you don't lock yourself out)
if command -v ufw &>/dev/null; then
  ufw --force reset  2>>"$INSTALL_LOG" || true
  ufw default deny incoming  2>>"$INSTALL_LOG"
  ufw default allow outgoing 2>>"$INSTALL_LOG"
  ufw allow ssh                      # 22
  ufw allow 80/tcp                   # HTTP
  ufw allow 443/tcp                  # HTTPS
  ufw allow 30303/tcp comment "GYDS P2P"
  ufw allow 30303/udp comment "GYDS P2P discovery"
  ufw --force enable 2>>"$INSTALL_LOG"
  log "UFW: SSH(22), HTTP(80), HTTPS(443), P2P(30303) open"
fi

# fail2ban minimal config
if command -v fail2ban-client &>/dev/null; then
  cat > /etc/fail2ban/jail.local <<'F2B'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled = true
port    = ssh
logpath = %(sshd_log)s
backend = %(sshd_backend)s

[nginx-http-auth]
enabled  = true

[nginx-limit-req]
enabled  = true
F2B
  systemctl enable fail2ban 2>>"$INSTALL_LOG" || true
  systemctl start  fail2ban 2>>"$INSTALL_LOG" || true
  log "fail2ban enabled (SSH + Nginx brute-force protection)"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 7 — Go toolchain (for blockchain nodes)
# ══════════════════════════════════════════════════════════════════════════════
if $INSTALL_GO; then
  step "7 — Go ${GO_VERSION} toolchain (blockchain nodes)"

  CURRENT_GO=""
  command -v go &>/dev/null && CURRENT_GO=$(go version 2>/dev/null | awk '{print $3}' | tr -d 'go')

  if [[ "$CURRENT_GO" == "$GO_VERSION" ]]; then
    info "Go ${GO_VERSION} already installed"
  else
    ARCH=$(uname -m)
    case "$ARCH" in
      x86_64)  GO_ARCH="amd64" ;;
      aarch64|arm64) GO_ARCH="arm64" ;;
      armv7l)  GO_ARCH="armv6l" ;;
      *)       warn "Unsupported architecture for Go: $ARCH — skipping"; GO_ARCH="" ;;
    esac

    if [[ -n "$GO_ARCH" ]]; then
      GO_TARBALL="go${GO_VERSION}.linux-${GO_ARCH}.tar.gz"
      GO_URL="https://go.dev/dl/${GO_TARBALL}"
      info "Downloading Go ${GO_VERSION} (${GO_ARCH})..."
      curl -fsSL "$GO_URL" -o "/tmp/${GO_TARBALL}" 2>>"$INSTALL_LOG"
      rm -rf /usr/local/go
      tar -C /usr/local -xzf "/tmp/${GO_TARBALL}" 2>>"$INSTALL_LOG"
      rm -f "/tmp/${GO_TARBALL}"

      # Add to system PATH
      cat > /etc/profile.d/go.sh <<'GOPATH'
export GOROOT=/usr/local/go
export GOPATH=$HOME/go
export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin
GOPATH
      chmod +x /etc/profile.d/go.sh
      # Apply immediately for this session
      export GOROOT=/usr/local/go
      export PATH=$PATH:/usr/local/go/bin
    fi
  fi

  GO_VER_OUT=$(/usr/local/go/bin/go version 2>/dev/null || go version 2>/dev/null || echo "not found")
  log "Go: ${GO_VER_OUT}"
else
  info "Skipping Go toolchain (--no-go)"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 8 — Docker CE + Docker Compose v2 (containerised nodes)
# ══════════════════════════════════════════════════════════════════════════════
if $INSTALL_DOCKER; then
  step "8 — Docker CE + Docker Compose v2"

  if command -v docker &>/dev/null; then
    info "Docker $(docker --version | awk '{print $3}' | tr -d ,) already installed"
  else
    case "$PKG_FAMILY" in
      debian)
        info "Adding Docker official GPG key and repository..."
        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/"${OS_ID}"/gpg \
          | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>>"$INSTALL_LOG"
        chmod a+r /etc/apt/keyrings/docker.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/${OS_ID} $(lsb_release -cs) stable" \
          > /etc/apt/sources.list.d/docker.list
        apt-get update -qq 2>>"$INSTALL_LOG"
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
          docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin \
          2>>"$INSTALL_LOG"
        ;;
      rhel|fedora)
        dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo \
          2>>"$INSTALL_LOG" || true
        dnf install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin \
          2>>"$INSTALL_LOG"
        ;;
      arch)
        pacman -S --noconfirm --needed docker docker-compose 2>>"$INSTALL_LOG"
        ;;
    esac
  fi

  systemctl enable docker 2>>"$INSTALL_LOG" || true
  systemctl start  docker 2>>"$INSTALL_LOG" || true

  # Add current user to docker group (if not root)
  DOCKER_USER="${SUDO_USER:-}"
  if [[ -n "$DOCKER_USER" && "$DOCKER_USER" != "root" ]]; then
    usermod -aG docker "$DOCKER_USER" 2>>"$INSTALL_LOG" || true
    info "Added ${DOCKER_USER} to docker group (re-login for effect)"
  fi

  DOCKER_VER=$(docker --version 2>/dev/null | awk '{print $3}' | tr -d , || echo "installed")
  COMPOSE_VER=$(docker compose version 2>/dev/null | awk '{print $4}' || echo "installed")
  log "Docker ${DOCKER_VER} | Compose ${COMPOSE_VER}"
else
  info "Skipping Docker (--no-docker)"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 9 — WireGuard (VPN mesh for node operators)
# ══════════════════════════════════════════════════════════════════════════════
if $INSTALL_WIREGUARD; then
  step "9 — WireGuard VPN"

  if command -v wg &>/dev/null; then
    info "WireGuard $(wg --version 2>/dev/null || echo '') already installed"
  else
    case "$PKG_FAMILY" in
      debian)
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq wireguard wireguard-tools 2>>"$INSTALL_LOG"
        ;;
      rhel)
        dnf install -y -q wireguard-tools 2>>"$INSTALL_LOG" || \
        yum install -y -q wireguard-tools 2>>"$INSTALL_LOG" || \
        { warn "wireguard-tools not in dnf — trying kmod-wireguard..."; dnf install -y -q kmod-wireguard wireguard-tools 2>>"$INSTALL_LOG" || true; }
        # Enable WireGuard kernel module
        modprobe wireguard 2>>"$INSTALL_LOG" || true
        echo "wireguard" >> /etc/modules-load.d/wireguard.conf 2>/dev/null || true
        ;;
      fedora)
        dnf install -y -q wireguard-tools 2>>"$INSTALL_LOG"
        ;;
      arch)
        pacman -S --noconfirm --needed wireguard-tools 2>>"$INSTALL_LOG"
        ;;
    esac
  fi

  # Enable IP forwarding (required for WireGuard routing)
  if ! grep -q "^net.ipv4.ip_forward=1" /etc/sysctl.conf 2>/dev/null; then
    echo "net.ipv4.ip_forward=1"   >> /etc/sysctl.conf
    echo "net.ipv6.conf.all.forwarding=1" >> /etc/sysctl.conf
    sysctl -p 2>>"$INSTALL_LOG" || true
  fi

  ufw allow 51820/udp comment "WireGuard VPN" 2>>"$INSTALL_LOG" || true
  log "WireGuard installed | IP forwarding enabled | UFW 51820/udp open"
else
  info "Skipping WireGuard (--no-wireguard)"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 10 — Certbot (Let's Encrypt SSL) — optional
# ══════════════════════════════════════════════════════════════════════════════
if $INSTALL_CERTBOT; then
  step "10 — Certbot (Let's Encrypt SSL)"
  case "$PKG_FAMILY" in
    debian)
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot python3-certbot-nginx 2>>"$INSTALL_LOG"
      ;;
    rhel|fedora)
      dnf install -y -q certbot python3-certbot-nginx 2>>"$INSTALL_LOG" || true
      ;;
    arch)
      pacman -S --noconfirm --needed certbot certbot-nginx 2>>"$INSTALL_LOG"
      ;;
  esac
  log "Certbot $(certbot --version 2>/dev/null || echo 'installed')"
else
  info "Skipping certbot (use --certbot flag or Cloudflare for SSL)"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 11 — Extra tools (htop, jq, tree, tmux)
# ══════════════════════════════════════════════════════════════════════════════
step "11 — Utility tools"
UTIL_PKGS="htop tree tmux net-tools dnsutils"
case "$PKG_FAMILY" in
  rhel|fedora) UTIL_PKGS="htop tree tmux net-tools bind-utils" ;;
  arch)        UTIL_PKGS="htop tree tmux net-tools dnsutils" ;;
esac
pkg_install $UTIL_PKGS 2>>"$INSTALL_LOG" || warn "Some utility tools failed to install (non-critical)"
log "Utility tools installed"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 12 — Logrotate for GYDSchain logs
# ══════════════════════════════════════════════════════════════════════════════
step "12 — Log management"
mkdir -p /var/log/gydschain
cat > /etc/logrotate.d/gydschain <<'LOGROTATE'
/var/log/gydschain/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 640 root adm
    sharedscripts
    postrotate
        pm2 flush 2>/dev/null || true
    endscript
}
LOGROTATE
log "Logrotate configured for /var/log/gydschain/"

# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
PUBLIC_IP=$(curl -sf4 --max-time 5 ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "<your-ip>")

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅  All requirements installed successfully                         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Versions:${NC}"
echo -e "    Node.js   $(node --version 2>/dev/null)"
echo -e "    npm       $(npm --version 2>/dev/null)"
echo -e "    PM2       $(pm2 --version 2>/dev/null | tail -1)"
echo -e "    PostgreSQL $(psql --version 2>/dev/null | awk '{print $3}')"
echo -e "    Nginx     $(nginx -v 2>&1 | grep -o 'nginx/[0-9.]*')"
$INSTALL_GO && echo -e "    Go        $(/usr/local/go/bin/go version 2>/dev/null | awk '{print $3}' | tr -d go || echo 'n/a')"
$INSTALL_DOCKER && echo -e "    Docker    $(docker --version 2>/dev/null | awk '{print $3}' | tr -d , || echo 'n/a')"
$INSTALL_WIREGUARD && echo -e "    WireGuard $(wg --version 2>/dev/null || echo 'installed')"
echo ""
echo -e "  ${CYAN}Next steps:${NC}"
echo -e "    1. Run the full deploy script:"
echo -e "       ${BOLD}sudo SUBDOMAIN=app DOMAIN=yourdomain.com bash public/scripts/deploy-dashboard.sh${NC}"
echo -e ""
echo -e "    2. Or use the master installer:"
echo -e "       ${BOLD}sudo bash install.sh${NC}"
echo ""
echo -e "  ${CYAN}Server IP:${NC}  ${PUBLIC_IP}"
echo -e "  ${CYAN}Log file:${NC}   ${INSTALL_LOG}"
echo ""
