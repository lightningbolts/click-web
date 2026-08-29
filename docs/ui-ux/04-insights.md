# Business Insights — Functional Clarity (Web)

**Routes:** `/insights/*`  
**Shell:** [`BusinessInsightsShell.tsx`](../../components/insights/BusinessInsightsShell.tsx)

---

## Shell

- Same [`ProductAppShell`](../../components/shell/ProductAppShell.tsx) as a horizontal top bar + animated mobile drawer (not a desktop sidebar). Opaque `surface`, 1px `border-hard`; no blur orbs or glass icon wells.
- Nav items: Overview, Social activity, Heatmap, Tribes, Vibe stream, Vibe radar, Live metrics, **Events**, **Event engagement**. Preserve `venue_id` on hrefs. Extra nav links back to the personal dashboard.
- Events: create/list via `EventCreateForm`, not Vibe Radar `BeaconDeployModal`. Funnel / network-health charts still aggregate live tables (`event_engagement_events`, recap SQL). `event_beacon_daily_stats` exists but is unused until [`event-schema-scaling-followups.md`](../event-schema-scaling-followups.md).
- Header actions: Demo, live timestamp, Refresh, Export, Settings, plus `ThemeToggle` in the top bar (marketing Navbar is hidden on `/insights`). Overview series use `primary` / `secondary` / `on-surface-variant` — no hex glow.

---

## Panels

- Replace `GlassPanel` with `FcCard`.
- Demo banner: bordered primary-container plate (no violet→amber gradient wash).
- Charts: Recharts grid/tooltip follow CSS tokens; primary series accent `#7C3AED`.

---

## Maps

- Pin/series color → `#7C3AED`
- Basemap: light Positron / dark Dark Matter
- Popups/controls: FC opaque panels
