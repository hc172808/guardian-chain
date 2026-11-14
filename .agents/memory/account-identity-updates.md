---
name: Account identity during updates
description: Preserve user logins during code updates, database migrations, and service restarts.
---

Existing usernames and password hashes must remain unchanged during updates and schema migrations. Bootstrap accounts may be inserted when absent, but startup must not overwrite an existing account's identity fields.

**Why:** The user requires updates to migrate the database without changing existing usernames or passwords.

**How to apply:** Route installer update modes through the guarded migration flow; reject migrations that rewrite username/password fields and keep bootstrap seeding insert-only.
