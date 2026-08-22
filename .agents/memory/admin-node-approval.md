---
name: Admin node approval actions
description: Approval mutations use a dedicated JSON action endpoint rather than the general node PATCH.
---

Admin node approval/revocation is intentionally handled by a dedicated POST action that returns a JSON envelope. Keep approval mutations separate from general node edits so proxied preview requests cannot surface an HTML challenge/fallback page as the update error.

**Why:** The general proxied mutation returned an HTML platform page to the browser, obscuring the actual result and making the admin toast misleading.

**How to apply:** Use the approval action for approve/revoke UI flows and keep general PATCH requests for editable node fields such as storage and WireGuard keys.