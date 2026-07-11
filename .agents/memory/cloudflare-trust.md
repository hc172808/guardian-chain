---
name: Cloudflare trust + IP-ban false positives
description: Why sites behind Cloudflare can suffer mass, self-inflicted IP bans, and how it's fixed
---

If a server's firewall/rate-limiter only trusts loopback as a "proxy" (the
default, safe posture when you don't know what's in front of you), and the
site is actually served through Cloudflare, then every visitor's TCP peer is
a Cloudflare edge IP, not their real IP. The `X-Forwarded-For`/
`CF-Connecting-IP` headers get ignored because the immediate hop isn't
trusted — so every visitor (and the site admin) collapses onto the same
handful of shared Cloudflare IPs from the app's point of view.

**Why this matters:** any burst/abuse detector that auto-bans an IP after
bad behavior will end up banning *that shared Cloudflare IP* — instantly
blocking 100% of traffic, including the owner's own admin session, and
looking exactly like "everyone keeps getting IP-blocked" or "actions
mysteriously fail as forbidden."

**How to apply:** trust Cloudflare's officially published IP ranges
(https://www.cloudflare.com/ips/, rarely changes) as proxy sources purely for
resolving the *real* client IP from `CF-Connecting-IP`. This is safe because
spoofing a Cloudflare edge source IP is not practically possible from the
public internet — only Cloudflare's own infrastructure can send from those
ranges. Also proactively purge any existing bans that match those ranges,
since they were always false positives, not real attackers. Provide an escape
hatch (env flag) to disable this if the deployment isn't actually behind
Cloudflare.
