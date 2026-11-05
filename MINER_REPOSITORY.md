# External Miner Project

Canonical source: https://github.com/hc172808/replit-project-migration

This is a separate TanStack Start application, not a drop-in package for this Vite/Express dashboard. Future miner fixes should be made in that repository and tested there; do not copy its app files into this project's `src/`.

## Security before cloning or linking

The upstream repository currently tracks a `.env` file. Its contents were not inspected. Treat it as potentially sensitive: audit it, remove it from the repository history, and rotate any credentials that may have been committed. Do not add this repository as a submodule or copy its files until that cleanup is complete. Review setup scripts before running them.

After cleanup, developers can clone the source separately:

```sh
git clone https://github.com/hc172808/replit-project-migration.git
```

Keep miner-specific fixes in that checkout and push them to the upstream repository. Changes to this dashboard's mining access controls and wallet integration remain in this repository.
