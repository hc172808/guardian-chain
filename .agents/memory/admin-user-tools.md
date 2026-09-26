---
name: Admin user tools
description: Admin user operations are audited and session-revoking; command access stays bounded.
---

Administrative user management supports profile edits, password resets, and session revocation. Password resets revoke the target's active sessions. The console exposes only named, server-validated commands; it must not become a browser-to-shell bridge.

**Why:** Admin actions affect authentication and can become a full server compromise if arbitrary command text is accepted from the dashboard.

**How to apply:** Keep new user/system operations behind requireAdmin, enforce founder-only changes to founder accounts, hash passwords with bcrypt, and write audit entries for mutations.