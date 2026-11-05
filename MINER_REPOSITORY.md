# External Miner Project

Canonical source: https://github.com/hc172808/replit-project-migration

This is a separate TanStack Start application, not a drop-in package for this Vite/Express dashboard. Future miner fixes should be made in that repository and tested there; do not copy its app files into this project's `src/`.

## Security before cloning or linking

The upstream repository currently tracks a `.env` file (confirmed from the repository tree; its contents were not fetched or inspected). Treat it as potentially sensitive: audit it, remove it from the repository history, and rotate any credentials that may have been committed. Do not add this repository as a submodule or copy its files until that cleanup is complete. Review setup scripts before running them.

## Developer workflow

After the `.env` cleanup, keep a separate checkout next to (not inside) this dashboard:

```sh
git clone https://github.com/hc172808/replit-project-migration.git ../gyds-miner
cd ../gyds-miner
git switch -c fix/short-description
# inspect the app's own README/package scripts before running setup
npm install
npm run
```

For an existing checkout, check local changes before updating, then fast-forward:

```sh
git -C ../gyds-miner status --short
git -C ../gyds-miner pull --ff-only origin main
```

Commit and push miner fixes to the miner repository, not this dashboard. Dashboard mining access controls, wallet binding, and the integration that launches or links to the miner stay in this repository. The dashboard's separate downloadable miner bundle is in `public/miner-download/`; do not assume it is the source of the external miner app.
