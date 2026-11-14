---
name: Account identity during updates
description: Preserve user logins during code updates, database migrations, and service restarts.
---

Existing usernames and password hashes must remain unchanged during updates and schema migrations. Bootstrap accounts may be inserted when absent, but startup must not overwrite an existing account's identity fields.

Installer option 5 should continue to update application code and the database schema; account credential preservation is a separate invariant.

**Why:** The user requires updates to preserve existing usernames and passwords, and explicitly chose code plus database updates for option 5 rather than database-only.

**How to apply:** Keep option 5's code pull, dependency/build steps, and service reload alongside guarded migrations; reject migrations that rewrite username/password fields and keep bootstrap seeding insert-only.
