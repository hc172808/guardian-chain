---
name: Test nodes
description: Dashboard-managed localhost node ports and how they differ from installed services
---

The dashboard's mainnet RPC simulator uses port 8547. The installed `gyds-rpcnode` systemd service uses port 8545 by default; these are separate services.

**Why:** Starting both on 8545 caused `EADDRINUSE` on self-hosted servers where the real RPC node was already running.

**How to apply:** Keep the test-node server configuration and Admin → Localhost Nodes initial status in sync. Dashboard Stop/Stop All only controls in-process simulator nodes. Inspect an occupied port with `sudo ss -ltnp 'sport = :PORT'`; stop the installed production RPC only when intended with `sudo systemctl stop gyds-rpcnode`.
