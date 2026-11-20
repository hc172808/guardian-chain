---
name: WireGuard registration
description: Distinguishes the server WireGuard identity from node peer registration.
---

The WireGuard server public key is only used in client configs; each remote node must register its own distinct public key. Local/test nodes stay bound to 127.0.0.1 and never become WireGuard peers. A live remote VPN peer is only a discovery candidate: adding it creates a pending node, and only explicit Admin approval allows it to sync.

**Why:** The user requires localhost-only nodes to stay off the VPN and remote detections to remain under manual control. A WireGuard handshake confirms connectivity, not application identity or approval.

**How to apply:** Keep server configuration and node registration separate; exclude `LOCAL:` entries from peer generation and sync; require the node's key plus a live handshake to add a remote candidate; keep it pending until approval in Admin → Nodes.