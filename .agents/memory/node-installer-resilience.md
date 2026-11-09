---
name: Node installer resilience
description: Required behavior when individual node roles fail during multi-node installation.
---

Each selected node role should be attempted independently. A role-specific installation problem should be recorded and skipped so remaining selected roles still run; shared source/dependency failures that block every role may stop the installer. Report partial success and preserve successful installs.

**Why:** the user requested that one node installation failure not prevent the other nodes from being installed.

**How to apply:** catch child installer failures inside the multi-node runner, summarize installed/skipped/failed roles, and return a nonzero status for partial installs without rolling back successful services.
