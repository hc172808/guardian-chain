---
name: Duplicate dev server processes after workflow restarts
description: Stray tsx/vite processes from a prior run can linger and cause confusing "stalled" behavior
---

Restarting a dev workflow doesn't always guarantee the previous process tree
fully exited before the new one starts. When that happens, two full
tsx+vite process groups end up running simultaneously, each trying to bind
the same ports — the new instance logs "Port 5000 is in use, trying another
one..." and falls back to a different port. Depending on how the proxy/preview
is wired, requests can land inconsistently between the old and new instance
(different in-memory state, different loaded code), which looks like random
stalling or "sometimes it works, sometimes it doesn't" rather than an obvious
crash.

**How to apply:** if behavior seems inconsistent right after a code change
despite a restart, check `ps aux | grep -E "tsx server|vite"` for more than
one live process group before assuming the bug is in the code. Kill the
stale one and restart cleanly.
