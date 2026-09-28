---
name: Remote WireGuard management
description: Remote VPS peer synchronization uses SSH with fingerprint verification and a Replit Secret for the private key.
---

The Admin Peer Manager treats the WireGuard VPS as a remote system: it stores only endpoint, interface, SSH metadata, and host fingerprint in the app configuration. The SSH private key stays in the `WG_SSH_PRIVATE_KEY` Replit Secret, and remote commands require passwordless `sudo`.

**Why:** A WireGuard endpoint and server public key cannot modify a separate VPS, while persisting an SSH private key in the database or frontend would expose a high-impact credential.

**How to apply:** Keep future remote peer operations behind the admin routes, require SHA-256 host fingerprint verification, and fail clearly when the secret, fingerprint, or sudo capability is missing.