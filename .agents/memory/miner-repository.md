---
name: External miner source
description: The separate miner application source and safe handling before future integration.
---

The miner source is maintained at https://github.com/hc172808/replit-project-migration. It is a separate app, not a drop-in package for the dashboard.

**Why:** The user asked that future developers be able to pull, debug, and fix the miner in its source repository. Its tracked `.env` must be treated as potentially sensitive.

**How to apply:** Make miner-specific changes in a separate checkout. Audit and clean the upstream `.env`, including rotating any exposed credentials, before linking it as a submodule or copying code into this project.
