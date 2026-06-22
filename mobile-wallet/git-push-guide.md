# How to Push Everything to GitHub

This covers pushing **both** repos to GitHub:
1. **ChainCore Dashboard** (this repo — the full GYDS dashboard/backend)
2. **GYDS Wallet** (the mobile wallet app at hc172808/your-digital-wallet)

---

## Part 1 — Push ChainCore Dashboard to GitHub

### Step 1: Create a GitHub repo

1. Go to https://github.com/new
2. Name it (e.g. `chaincore-dashboard` or `gydschain-dashboard`)
3. Set it to **Private** or **Public**
4. Do **NOT** initialize with a README (you already have code)
5. Click **Create repository**

### Step 2: Add the remote and push

Run this from the **ChainCore project root** (where `package.json` is):

```bash
# Check if a remote already exists
git remote -v

# If no remote, add yours:
git remote add origin https://github.com/YOUR-USERNAME/chaincore-dashboard.git

# If a remote already exists with the wrong URL, update it:
git remote set-url origin https://github.com/YOUR-USERNAME/chaincore-dashboard.git

# Push everything
git add -A
git commit -m "feat: full ChainCore dashboard with Living Trust, mobile wallet setup"
git branch -M main
git push -u origin main
```

### Step 3: Push future changes

After making changes:

```bash
git add -A
git commit -m "your message here"
git push
```

---

## Part 2 — Push changes to the GYDS Wallet app

The wallet lives at: https://github.com/hc172808/your-digital-wallet

If you have push access (it's your repo), run from inside `gyds-wallet/`:

```bash
cd gyds-wallet

# Stage changes
git add -A

# Commit
git commit -m "feat: configure for netlifegy.com domain, update env"

# Push to the main branch
git push origin main
```

If you want to push from a **fork** instead:
1. Fork the repo on GitHub
2. Change the remote: `git remote set-url origin https://github.com/YOUR-USERNAME/your-digital-wallet.git`
3. Push as above

---

## Part 3 — Keep both repos in sync (recommended workflow)

You have two independent repos:
- `chaincore-dashboard/` — the web dashboard (this project)
- `gyds-wallet/` — the mobile wallet app

They share the same GYDS chain config. Update chain settings in both when changing:
- RPC endpoints
- Chain ID
- Block explorer URL
- API base URL

### Automate syncing with a script

```bash
# push-all.sh — push both repos at once
#!/usr/bin/env bash
set -e
MSG="${1:-chore: sync update}"

echo "Pushing ChainCore dashboard..."
git -C . add -A && git -C . commit -m "$MSG" && git -C . push

echo "Pushing GYDS Wallet..."
git -C gyds-wallet add -A && git -C gyds-wallet commit -m "$MSG" && git -C gyds-wallet push

echo "Both repos pushed."
```

```bash
# Make it executable
chmod +x push-all.sh

# Use it
./push-all.sh "feat: add trust notifications"
```

---

## Part 4 — GitHub Actions CI/CD (optional, recommended)

Set up auto-deployment so every push to `main` deploys automatically.

### ChainCore dashboard — `.github/workflows/deploy.yml`

```yaml
name: Deploy ChainCore

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - name: Deploy to server via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          script: |
            cd /var/www/chaincore
            git pull origin main
            npm ci --production
            npm run build
            pm2 restart chaincore
```

Add secrets in GitHub → repo → Settings → Secrets:
- `SERVER_HOST` — your server IP or domain
- `SERVER_USER` — ssh user (e.g. `root` or `ubuntu`)
- `SERVER_SSH_KEY` — your private SSH key

### GYDS Wallet — auto-build on push

The wallet repo already has `.github/workflows/deno.yml`. You can add a similar
deploy workflow there for the wallet's `dist/` folder.

---

## Quick Reference

| Action | Command |
|--------|---------|
| Push ChainCore | `git add -A && git commit -m "msg" && git push` |
| Push wallet | `cd gyds-wallet && git add -A && git commit -m "msg" && git push` |
| Push both | `./push-all.sh "your message"` |
| Check status | `git status` |
| See remotes | `git remote -v` |
| See log | `git log --oneline -10` |
