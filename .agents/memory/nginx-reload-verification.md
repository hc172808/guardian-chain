---
name: Nginx reload verification
description: How installers should verify a virtual host after an Nginx reload.
---

After reloading Nginx, poll the virtual-host response for a bounded period before failing on stale default-page content.

**Why:** The server later returned the correct dashboard from the same loaded site configuration, showing that a single immediate request can mistake a transient reload response for a persistent routing problem.

**How to apply:** In deployment scripts, retry the local host-header request briefly after reload, then fail with diagnostics if the wrong page persists.
