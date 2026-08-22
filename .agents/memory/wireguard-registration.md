---
name: WireGuard registration
description: Distinguishes the server WireGuard identity from node peer registration.
---

The WireGuard server public key is only used in client configs; each node must register its own distinct public key before it can appear as an approved application node.

**Why:** WireGuard peers are cryptographic identities, and the app cannot infer an application node registration merely because a peer exists in wg0.conf.

**How to apply:** Keep server configuration and node registration as separate steps; require the node's public key when registering a remote node and approve it in Admin → Nodes.