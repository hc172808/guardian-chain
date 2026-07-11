---
name: Public RPC endpoints must not require session auth
description: Why JSON-RPC / mining-proxy style endpoints break when guarded by requireAuth
---

Endpoints meant to be consumed by external, non-browser clients — JSON-RPC
nodes, wallet RPC proxies, standalone mining scripts running on someone's own
server — never have a browser session cookie. If such a route is wrapped in
session-based `requireAuth` middleware, every external client gets rejected
(401, or in an SPA gets redirected to an HTML login page instead of JSON),
while manual testing from the logged-in web UI looks fine — hiding the bug
until someone actually runs the standalone client.

**How to apply:** keep these routes public, protected only by the same
mechanisms other anonymous RPC endpoints use (IP rate limiting, the app's
general firewall middleware) — never a login. When adding a new proxy/RPC
route, check whether sibling RPC routes in the same file already skip
`requireAuth`, and match that pattern rather than defaulting to auth-required.
