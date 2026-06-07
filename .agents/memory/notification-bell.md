---
name: Notification Bell
description: In-app notification bell component in Layout header.
---

`src/components/layout/NotificationBell.tsx` — dropdown bell with:
- 5 notification types: tx, price, node, governance, announcement (each with icon + color)
- Unread badge count on bell icon
- Mark all read / dismiss individual
- Demo data (in production would query user_notifications Supabase table)
- Wired into Layout.tsx — shows in top-right on desktop only (fixed, z-30)
- Only renders when user is logged in

**Why:** Notification bell is behind auth guard since anonymous users have no notifications.
