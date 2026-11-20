# GYDSchain Dashboard: Ubuntu Server Deployment

This guide covers the **dashboard and API only**. It does not install or configure
blockchain nodes. It is based on `public/scripts/deploy-dashboard.sh`, the
currently supported one-shot installer.

## Important safety rules

- Use `deploy-dashboard.sh` for a new dashboard installation. Do **not** run it
  and `setup-server.sh` one after the other. Both configure Nginx, UFW, PM2, and
  the app directory; `setup-server.sh` also runs `ufw --force reset`, which
  deletes existing UFW rules.
- Do not rerun the installer to update an existing deployment. It rewrites
  `.env`, reapplies server configuration, installs packages, applies database
  migrations, and deletes/restarts the PM2 app. Use the dashboard update button
  or the installed `gyds-redeploy` wrapper instead.
- Do not run `public/scripts/db-reset.sh`, drop tables, truncate tables, or
  initialize a new genesis over a live chain as part of a dashboard update.
- Take and verify a database backup before any migration or production update.
- Keep the public firewall closed to everyone except your own IP during the
  initial account setup. The installer starts the web server before it finishes.

## 1. Check prerequisites and choose the server

You need:

- A supported Ubuntu/Debian VPS, a public static IP, and sudo access.
- A domain and access to its DNS settings.
- A regular Linux account for the application process. The script uses the
  account that invoked `sudo` (`SUDO_USER`); if unavailable it defaults to
  `ubuntu`. That account must already exist.
- A database choice: let the installer create a local PostgreSQL database, or
  provide a tested PostgreSQL `DATABASE_URL`.
- Enough free disk for Node dependencies, the production build, logs, and a
  private application backup during dashboard updates. The installer does not
  enforce a minimum disk or memory size.

The current defaults are:

| Setting | Default |
| --- | --- |
| App directory | `/var/www/gydschain` |
| Linux/PM2 account | The user invoking `sudo`, otherwise `ubuntu` |
| Express API port | `5001` |
| PM2 process | `gydschain-api` |
| Dashboard hostname | `app.netlifegy.com` |
| Local dashboard health | `http://127.0.0.1:5001/api/auth/captcha/health` |
| Database-aware health | `http://127.0.0.1:5001/api/deployment-health` |
| Nginx health | `http://YOUR_HOST/health` |

The deployment scripts install Node.js 22 when Node.js 20 or newer is not
already present, along with PostgreSQL, Nginx, PM2, UFW, fail2ban, and cron.

## 2. Prepare SSH and firewall access

1. Use a named, non-root Linux account with sudo. On a provider that supplies an
   `ubuntu` account, use it rather than creating another account.
2. Install your **public** SSH key on that account from your own computer:

   ```bash
   ssh-copy-id -i ~/.ssh/id_ed25519.pub ubuntu@YOUR_SERVER_IP
   ```

   Replace `ubuntu` if you use another service account. Do not copy your private
   key to the server.
3. Open a second terminal and confirm that key-based SSH and `sudo` work. Keep
   the first SSH session open. Do not disable password or root SSH access until
   the new login path has been verified.
4. In the hosting provider's firewall, allow SSH from your own IP. Temporarily
   limit ports 80 and 443 to your IP as well; keep them limited until the
   bootstrap account passwords are changed in step 8.
5. Do not expose PostgreSQL port `5432` or the dashboard API port `5001` to the
   internet. Nginx proxies API requests to `127.0.0.1:5001`.
6. Keep SSH on its standard port 22 for this install unless you first update
   and test the matching UFW rule; the installer allows the `ssh` service.
7. The installer installs fail2ban but does not configure an SSH jail in this
   script. Review any existing fail2ban configuration and enable an `sshd` jail
   before relying on it. Do not overwrite a host's existing jail configuration
   without reviewing it. If there is no existing SSH jail drop-in, you can add
   one and verify it:

   ```bash
   sudo install -d -m 755 /etc/fail2ban/jail.d
   if ! sudo test -e /etc/fail2ban/jail.d/sshd.local; then
     sudo tee /etc/fail2ban/jail.d/sshd.local >/dev/null <<'EOF'
   [sshd]
   enabled = true
   EOF
   fi
   sudo systemctl enable --now fail2ban
   sudo fail2ban-client status sshd
   ```

The installer sets UFW's default incoming policy to deny, allows SSH, 80/tcp,
443/tcp, and 30303/tcp+udp, denies the configured API port, and enables UFW. It
does **not** reset UFW, but the new default policy can affect other services.
Review existing host and provider firewall rules first. Port 30303 is for P2P;
the dashboard installer does not install a node, so remove that allowance if no
service needs it. The older `setup-server.sh` resets UFW and should not be run
on a host with existing firewall rules.

## 3. Configure DNS and TLS

Choose the dashboard hostname before installation. With the default subdomain,
create:

| Type | Name | Value |
| --- | --- | --- |
| A | `app` | `YOUR_SERVER_IP` |

Use your own domain in place of `netlifegy.com`. The default hostname is
`app.netlifegy.com`; setting `SUBDOMAIN=""` uses the root domain.

Choose one TLS option:

1. **Origin certificate / Let's Encrypt (recommended):** run the installer with
   `USE_CERTBOT=1` and `GYDS_SSL_EMAIL=YOUR_EMAIL`. Let DNS resolve to this
   server and allow HTTP/HTTPS traffic for the certificate challenge. If using
   Cloudflare Proxy, use **Full (strict)** after the origin certificate is
   installed.
2. **Cloudflare Tunnel:** provide `CF_TUNNEL_TOKEN` through a protected secret
   input. Never paste it into chat, a Git repository, or a command that will be
   saved in shell history. Verify the tunnel hostname and service target before
   opening public traffic.
3. **Cloudflare Proxy without an origin certificate:** the installer leaves
   Nginx listening on HTTP port 80. Do not select Cloudflare Full or Full
   (strict) until HTTPS is configured at the origin; those modes require an
   origin TLS listener. Flexible mode encrypts only the browser-to-Cloudflare
   leg and is not recommended for a permanent deployment.

After DNS changes, verify them:

```bash
dig +short app.example.com
```

Replace the example hostname with yours. Do not proceed to public access if it
resolves to the wrong server.

## 4. Back up an existing database before installation

Skip this section only when creating a brand-new database.

The default local database name is `gydschain`. Back it up to a private
directory before approving schema migrations:

```bash
BACKUP_FILE="/var/backups/gydschain-db/predeploy-$(date -u +%Y%m%dT%H%M%SZ).dump"
sudo install -d -o postgres -g postgres -m 700 /var/backups/gydschain-db
sudo -u postgres pg_dump --format=custom \
  --file="$BACKUP_FILE" gydschain
sudo -u postgres pg_restore --list "$BACKUP_FILE" >/dev/null
```

If the database has another name, replace `gydschain`. For a managed or remote
PostgreSQL database, use the provider's snapshot/backup feature or an approved
secure `pg_dump` process; do not put the database URL in shell history, tickets,
or chat. Store a copy off the VPS and verify that the backup can be read.

Also preserve the current app configuration before changing an existing
installation:

```bash
CONFIG_BACKUP="/var/backups/gydschain-config/$(date -u +%Y%m%dT%H%M%SZ)"
sudo install -d -m 700 "$CONFIG_BACKUP"
sudo cp -a /var/www/gydschain/.env \
  /var/www/gydschain/gyds-config.env "$CONFIG_BACKUP/"
sudo chmod 600 "$CONFIG_BACKUP/.env" "$CONFIG_BACKUP/gyds-config.env"
```

The installer detects a database with existing tables. In interactive mode it
asks before applying migrations; in non-interactive mode it refuses unless
`ALLOW_EXISTING_DB_MIGRATIONS=1` is explicitly set. Set that flag only after
reviewing the migrations and verifying the backup. The installer runs the
checked-in migrations through `psql`; it does not drop existing rows. A schema
migration can still affect the application, so a backup is required.

## 5. Install the dashboard

Fetch the repository on the server so you can run the checked-in installer. The
default repository is `https://github.com/hc172808/guardian-chain.git`:

```bash
git clone --depth 1 --branch main \
  https://github.com/hc172808/guardian-chain.git \
  /tmp/gydschain-installer
cd /tmp/gydschain-installer
```

Run the installer as root, replacing the domain and email:

```bash
sudo env \
  SUBDOMAIN=app \
  DOMAIN=example.com \
  USE_CERTBOT=1 \
  GYDS_SSL_EMAIL=admin@example.com \
  REPO_URL=https://github.com/hc172808/guardian-chain.git \
  BRANCH=main \
  bash public/scripts/deploy-dashboard.sh
```

The defaults are `APP_DIR=/var/www/gydschain` and `PORT_API=5001`; override them
only if you have reviewed the Nginx, PM2, firewall, backup, and updater settings
that also depend on those values.

During setup:

1. Confirm the target domain and app directory.
2. Choose local PostgreSQL or provide a tested existing database connection.
3. If existing tables are detected, stop unless you have a verified backup and
   intend to apply the reviewed migrations.
4. Enter optional configuration only through the prompts. The deployment script
   writes `.env`, creates the PM2 app, builds the frontend, configures Nginx,
   checks the API, and enables the UFW rules.

The installer is for a dedicated dashboard host. It replaces
`/etc/nginx/sites-available/gydschain`, disables Nginx's default site, and
restarts `gydschain-api`. Do not run it on a multi-site server without reviewing
those effects. If it finds an unexpected checkout in `APP_DIR`, it stops. Do
not set `REPLACE_APP_CHECKOUT=1` unless you intentionally want it moved aside to
a timestamped backup directory.

### Repository access and tokens

The default repository is public, so leave `GITHUB_TOKEN` blank. The installer
uses a token-bearing clone URL if `GITHUB_TOKEN` is supplied and writes that
value into configuration files; do not enter a personal access token on a
shared server. For a private repository, arrange a read-only deploy key with
the server administrator and verify that both the installer and the PM2
account can pull without embedding a token in the Git remote URL.

Entering `GITHUB_TOKEN` also creates an optional five-minute Git pull cron job.
That job only pulls files; it does not build or restart the app. Use the
documented updater instead.

## 6. Protect environment files and bootstrap accounts

The installer creates `.env` with mode `600`. It also stores some shared
settings in `gyds-config.env`; keep both readable only by root and the app
account. After installation, verify:

```bash
APP_USER=ubuntu
APP_DIR=/var/www/gydschain
sudo chown "$APP_USER:$APP_USER" "$APP_DIR/.env" "$APP_DIR/gyds-config.env"
sudo chmod 600 "$APP_DIR/.env" "$APP_DIR/gyds-config.env"
sudo stat -c '%a %U:%G %n' "$APP_DIR/.env" "$APP_DIR/gyds-config.env"
```

Use the actual PM2 account if it is not `ubuntu`. The admin Server Configuration
screen also writes environment files; the current server code keeps both files
at mode `600`.

The checkout and its parent directories must remain traversable/readable by
Nginx so it can serve `dist`; do not apply `chmod 700` recursively to the
application tree. The installer assigns the tree to the PM2 account. Check
ownership and secret-file modes without weakening Nginx access:

```bash
sudo stat -c '%A %U:%G %n' \
  /var/www /var/www/gydschain /var/www/gydschain/dist \
  /var/www/gydschain/.env /var/www/gydschain/gyds-config.env
```

Treat the installer output as secret: it prints `DATABASE_URL` and
`SESSION_SECRET`. Do not share its terminal output or a screenshot without
redacting those values. Never commit `.env`, database credentials, session
secrets, private keys, Cloudflare tokens, or Git credentials.

On a **fresh database**, the bootstrap `founder` and `admin` accounts use the
initial password `password`. Existing usernames and password hashes are
preserved by the seed process; it does not reset existing account passwords.
Before opening the site to everyone:

1. Keep the provider firewall restricted to your IP.
2. Sign in to each fresh bootstrap account and change its password in the
   account/profile password settings. Use unique, long passwords.
3. Confirm both new passwords work, then widen the provider firewall to the
   intended public or Cloudflare-only ingress.

Do not assume changing `ADMIN_PASSWORD` or `FOUNDER_PASSWORD` after those
accounts already exist will change their password hashes. Use the account
settings flow for existing accounts.

## 7. Configure the six treasury recipients

The treasury recipient addresses are public EVM addresses, not private keys.
They are distinct from `ADMIN_WALLET` and `FOUNDER_WALLET`, which are identity
settings.

When prompted by the installer, enter all six unique addresses or leave them
blank and configure them later under **Admin → Server Configuration → Genesis
Treasury Recipients**:

| Environment setting | Allocation |
| --- | ---: |
| `GYDS_TREASURY_FOUNDER_ADDRESS` | 300,000,000 GYDS |
| `GYDS_TREASURY_MINING_POOL_ADDRESS` | 1,200,000,000 GYDS |
| `GYDS_TREASURY_LIQUIDITY_POOL_ADDRESS` | 600,000,000 GYDS |
| `GYDS_TREASURY_STAKING_REWARDS_ADDRESS` | 450,000,000 GYDS |
| `GYDS_TREASURY_DEVELOPMENT_FUND_ADDRESS` | 300,000,000 GYDS |
| `GYDS_TREASURY_TEAM_ADDRESS` | 150,000,000 GYDS |

The fixed allocation total remains 3,000,000,000 GYDS. The server checks that
all six values are valid 20-byte `0x` addresses and are not duplicates. If any
are missing or invalid, Treasury sends and genesis exports remain disabled and
the API lists the settings that need correction. No database wallet rows or
historical transactions are deleted or reassigned.

These recipients determine a **new genesis export**; changing an address does
not move funds on an already initialized chain. Do not initialize an existing
production chain from a newly generated genesis file.

## 8. Verify PM2, Nginx, firewall, and health

The installer runs the Express server as the app account through PM2, serves
the built frontend from `dist` through Nginx, saves the PM2 process list, and
enables a `pm2-APP_USER.service` systemd unit for boot recovery.

Replace `ubuntu` with the account that invoked `sudo`:

```bash
APP_USER=ubuntu
sudo -u "$APP_USER" pm2 status
sudo systemctl status "pm2-${APP_USER}.service" --no-pager
sudo nginx -t
sudo ufw status verbose
```

Check each health endpoint; they verify different things:

```bash
# API process/auth health
curl -fsS http://127.0.0.1:5001/api/auth/captcha/health

# Express API plus database connection (used by the browser updater)
curl -fsS http://127.0.0.1:5001/api/deployment-health

# Nginx virtual-host health response (does not verify the database)
curl -fsS https://app.example.com/health

# Login route through Nginx
curl -I https://app.example.com/auth
```

Replace the hostname and protocol for your setup. The installer also checks
`/api/auth/captcha/health` and `/auth` itself. Do not open API port `5001` or
PostgreSQL port `5432` to the internet.

## 9. Enable “Pull, rebuild & restart” in the admin page

This feature runs only when `NODE_ENV=production` and
`ENABLE_SERVER_UPDATES=true`. The state directory must be an absolute path
outside the application folder, owned by the same OS account that runs PM2.

Edit `/var/www/gydschain/.env` and add:

```dotenv
ENABLE_SERVER_UPDATES=true
DASHBOARD_APP_DIR=/var/www/gydschain
DASHBOARD_UPDATE_STATE_DIR=/var/lib/gydschain-updates
PM2_APP=gydschain-api
UPDATE_HEALTH_URL=http://127.0.0.1:5001/api/deployment-health
```

Then set up the private state directory and restart PM2 as the same account:

```bash
APP_USER=ubuntu
APP_DIR=/var/www/gydschain
sudo install -d -o "$APP_USER" -g "$APP_USER" -m 700 \
  /var/lib/gydschain-updates
sudo chmod 600 "$APP_DIR/.env" "$APP_DIR/gyds-config.env"
sudo -u "$APP_USER" pm2 restart gydschain-api --update-env
```

Verify `curl -fsS http://127.0.0.1:5001/api/deployment-health` returns
`{"ok":true}`. Then use **Admin → GitHub Sync → Pull, rebuild & restart**.

The updater requires a clean Git working tree, a saved PM2 process named
`gydschain-api`, `package-lock.json`, and enough free space for a private archive
of the application. It pulls only with fast-forward Git, installs locked
packages, builds, restarts PM2, and checks the database-aware health endpoint.
On failure it attempts to restore the prior application files and restart.

It does **not** run the numbered SQL migrations. Startup code can still contain
schema setup, so back up the database before releases that change schema. For
the explicit migration-aware CLI updater, use:

```bash
APP_USER=ubuntu
APP_DIR=/var/www/gydschain
sudo -u "$APP_USER" bash \
  "$APP_DIR/public/scripts/gyds-update.sh" --status
```

Review the release and database backup before running an update that applies
migrations. To install the shorter `gyds-update` command, run
`sudo bash /var/www/gydschain/public/scripts/gyds-update.sh --install`.

## 10. Routine maintenance and recovery

Useful status and log commands:

```bash
APP_USER=ubuntu
sudo -u "$APP_USER" pm2 status
sudo -u "$APP_USER" pm2 logs gydschain-api --lines 100
sudo systemctl status "pm2-${APP_USER}.service" --no-pager
sudo journalctl -u "pm2-${APP_USER}.service" -n 100 --no-pager
sudo tail -n 100 /var/log/gydschain/api-error.log
sudo tail -n 100 /var/log/gydschain/api-out.log
sudo tail -n 100 /var/log/gydschain/nginx-error.log
sudo ufw status numbered
```

For a normal service restart that does not touch database rows:

```bash
APP_USER=ubuntu
sudo -u "$APP_USER" pm2 restart gydschain-api --update-env
```

If the public page fails, check in this order:

1. `dig +short YOUR_HOSTNAME` returns the intended server IP.
2. `sudo systemctl status "pm2-${APP_USER}.service"` and `pm2 status` show the
   saved process is online.
3. The local API health endpoint on port 5001 returns JSON.
4. `sudo nginx -t` passes and Nginx is active.
5. UFW and the provider firewall allow the chosen SSH and web ingress, while
   keeping 5001 and 5432 private.
6. The database-aware health endpoint returns `{"ok":true}`.

For a failed browser update, inspect the status in GitHub Sync and the private
files under `/var/lib/gydschain-updates/` (`private.log`, `status.json`, and any
retained rollback archive). The app updater does not remove persistent
`data`, `uploads`, or `logs`; do not delete the state directory while recovery
is in progress.

For database recovery, preserve the failed database and restore the verified
backup into a separate empty database first. Validate its tables and users
before changing the production `DATABASE_URL`. Do not restore over the live
database until you have taken a second backup of its current state and chosen
the exact recovery point. Never use `pg_restore --clean` against the live
database as a troubleshooting shortcut.

## Notes about alternate and older instructions

- `public/scripts/setup-server.sh` is a separate full installer. It resets UFW
  (`ufw --force reset`), replaces Nginx configuration, and rewrites `.env`.
  Do not run it on an existing host or combine it with the procedure above.
- `public/docs/DNS_SERVER_SETUP.md` also describes blockchain node ports and a
  firewall reset. It is not the dashboard-only deployment procedure in this
  guide.
- `public/docs/DASHBOARD_UPDATES.md` contains the focused updater settings and
  recovery boundaries. This guide includes the same required values in the
  broader server setup.
