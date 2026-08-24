# Business Insights — Functional Clarity (Web)

**Routes:** `/insights/*`  
**Shell:** [`BusinessInsightsShell.tsx`](../../components/insights/BusinessInsightsShell.tsx)

---

## Shell

- Opaque header with hard border; no blur orbs or glass icon wells.
- Nav tabs: bordered / selected solid states. Include **Events** (create/list via `EventCreateForm`, not Vibe Radar `BeaconDeployModal`) plus **Event engagement** (funnel analytics) and later network-health trend.
- Funnel / network-health charts still aggregate live tables (`event_engagement_events`, recap SQL). `event_beacon_daily_stats` exists but is unused until [`event-schema-scaling-followups.md`](../event-schema-scaling-followups.md).
- Include `ThemeToggle` in header actions (Navbar is hidden on `/insights`).

---

## Panels

- Replace `GlassPanel` with `FcCard`.
- Demo banner: bordered primary-container plate (no violet→amber gradient wash).
- Charts: Recharts grid/tooltip follow CSS tokens; series accent `#630ED4`.

---

## Maps

- Pin/series color → `#630ED4`
- Basemap: light Positron / dark Dark Matter
- Popups/controls: FC opaque panels
