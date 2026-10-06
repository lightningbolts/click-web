# Events: Click Pass, calendar, maps, weather, Place hosts, flyers — web UI spec

Status: **backend shipped, web UI pending.** The iOS app ships these surfaces now. The web UI is
deliberately not built yet, so it lands with the upcoming web redesign instead of conflicting with it.
Everything below is buildable on today's API; no backend work is needed unless noted.

Follow `01-design-system-web.md` (Functional Clarity tokens) and `05-events.md` (event page layout).
Every surface must work from 320 px phones to wide desktop; no horizontal scroll.

---

## 1. Click Pass (ticket for people going)

**What it is.** After an approved RSVP, each attendee has a Click Pass: a QR their host scans at the
door. It's stateless and permanent per attendee and event (an HMAC credential), so a printed or
screenshotted copy works offline; the host's scan re-checks the live RSVP, so a cancelled RSVP voids
it, and a second scan reports "already checked in" with the holder's name and photo.

**API**
- `GET /api/beacons/{id}/pass` (Bearer/cookie) → `{ credential_url, code, checked_in_at, wallet_available }`.
  403 `not_going` when the viewer has no approved RSVP (requests and waitlists get one on approval).
- `GET /api/beacons/{id}/pass/wallet` → signed `.pkpass` (`application/vnd.apple.pkpass`).
  404 `wallet_unavailable` until the Pass Type ID certificate is configured (see `.env.example`).
- `credential_url` is the event's public link with the pass attached:
  `https://joinclick.co/e/{id}?pass=1.{user}.{sig}`. Any non-Click camera lands on the event page.

**Where (web).**
- Event page (`/e/{id}`), when the signed-in viewer is going and the event hasn't ended: a "Your Click
  Pass" card directly under the RSVP button (QR glyph tile · "Your Click Pass" · "Show it at the door"),
  opening the pass. Once checked in: green check tile, "You're checked in".
- Pass view (`/e/{id}/pass`, or a modal on desktop): a ticket card, max-width ~440 px, centered.
  1. Event picture (2:1, `CardVisualHero` fallback), title, when, where.
  2. Perforated tear line (dashed rule with two half-circle notches cut into the card edges).
  3. QR on a white rounded square (never themed: scanners need dark-on-white), `code` below in
     monospace with wide tracking ("K7P-4QX"), then the holder row (avatar, name, status:
     "Going" / "Going · show this at the door" while live / "You're in · checked in 7:42 PM").
  4. Checked in: QR dims to ~35 % with a large green check over it.
- Actions under the ticket: **Add to Apple Wallet** (official badge, only when `wallet_available` and the
  browser is Safari on iOS/macOS; link to `/api/beacons/{id}/pass/wallet`), then three equal tiles:
  **Calendar** (§2), **Directions** (§3), **Contact** (§6).
- Footnote: "Your host scans this at the door. It's yours alone: if it's shared, the host sees your
  name and photo."
- While the event is live (or starts within the hour) and the pass isn't checked in, poll
  `GET /pass` every ~4 s while the tab is visible; when `checked_in_at` appears, animate to the
  checked-in state. Stop polling once checked in or the tab is hidden.
- Wake lock: request `navigator.wakeLock` while the pass is visible (the web can't raise screen
  brightness; say "Turn your brightness up" in the footnote on mobile browsers instead).

## 2. Add to Calendar

One control: a capsule under the event's date line, "Add to Calendar" (calendar-plus icon) for any
upcoming event. On the web it opens a small menu: **Apple / Outlook (.ics)**, **Google Calendar**,
**Outlook.com**. Generate the `.ics` client-side (VEVENT with UID `{beacon_id}@joinclick.co`, DTSTART/DTEND
in UTC, SUMMARY, LOCATION = location name + address, URL = event link, DESCRIPTION = plain-text
description + link). Google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=…/…&location=…&details=…`.
After a choice, the capsule reads "In Calendar ✓" for that event (localStorage, per viewer).

## 3. Directions and location

The location card and the Directions action open a chooser (popover on desktop, bottom sheet on
mobile): **Apple Maps** (`https://maps.apple.com/?daddr=lat,lng` for directions, `?ll=lat,lng&q=name`
for the place), **Google Maps** (`https://www.google.com/maps/dir/?api=1&destination=lat,lng` /
`https://www.google.com/maps/search/?api=1&query=lat,lng`), **Copy address** (when there's an
address). The public event payload now carries `address` (street address) besides `location_name`.

## 4. Weather

`GET /api/geo/weather?lat&lng[&at=ISO]` (public, IP-rate-limited, cached 10 min) →
`{ now: Reading|null, at: (Reading & { time })|null }`, Reading =
`{ temperature_c, condition, icon, is_day, precipitation_probability }`. `at` is only returned for a
time 1 h–7 days ahead.

In the location card, under the address, one line: condition icon + "64° Cloudy now · 58° Rain at
7 PM, 70% chance of rain" (the chance only when ≥ 30 %). Format temperature in the viewer's locale
(°F for US). Icon keys: `clear`, `cloudy`, `fog`, `drizzle`, `rain`, `snow`, `thunder` (+ `is_day` for
sun/moon variants). Hide the line for ended events and when both readings are null. Never block the
page on it.

## 5. Click Places as hosts

Place refs (`place` on event payloads, list and detail) now carry `photo_url` and `city`.
- Event page: when `place` is set, the host line becomes the Place: its photo (round, 26 px), "Hosted by
  **{Place}** · {city}", chevron, linking to `/p/{slug}`. It replaces the separate "At {place}" row.
- Wallet passes and flyers credit the Place as host.
- Place page "Happening here": each upcoming event row gets its picture (`upcoming_events[].image_url`,
  52 px rounded square, `CardVisual` fallback seeded by `beacon_id`) beside title and start time; "Live"
  pill when live.

## 6. Contact host

A menu on the pass (and optionally the event page host line): **View {Place}** (Place-hosted events),
**Message {first name}** (only when the host is the viewer's Click: open that chat), and always
**Ask in event chat** (hosts are always in it).

## 7. Host door scanner

Hosts (and co-hosts: `requireEventManager`) get **Scan Click Passes** in the event's Hosting section
while the event hasn't ended.

- `POST /api/beacons/{id}/pass/scan` `{ credential }` → always 200 with
  `{ result, attendee: { user_id, name, avatar_url } | null, checked_in_at, check_in_count? }`.
  `result`: `checked_in` (green, "Checked in · N here now") · `already_checked_in` (amber, "Already
  checked in at 7:42 PM. Make sure it's them.") · `not_going` (red, "Not on the list") ·
  `wrong_event` (amber, "Pass for another event") · `invalid` (red, "Not a Click Pass").
- Web: camera via `BarcodeDetector` (fallback: a QR library), full-bleed video, result card pinned
  to the bottom with the attendee's photo (64 px) and name large enough to read at arm's length.
  Ignore the same code for 3 s; a network error says so and allows an immediate retry.

## 8. Click Flyer

"Create Click Flyer" in the event's share menu. Two formats: **Story 1080×1920** and **Post 1080×1350**.
Composition (dark, regardless of theme): event picture blurred to a full-bleed wash (or its
`CardVisual` gradient), darkening gradient; header with the Click mark + "Click" and "YOU'RE INVITED";
the event picture as a rounded poster (aspect clamped 0.8–1.78); when (uppercase, tracked), title
(Manrope ExtraBold, ≤ 3 lines), place, "Hosted by …"; footer pill with a QR to the event link,
"RSVP on Click" and the short link. Render client-side to canvas/PNG; actions: Download and Share
(Web Share API with files where supported).

## 9. Event chat lifetime (copy only)

Event chats now keep their history from creation until a day after the event's Click Drops reveal
(10:00 local the morning after it ends), then close. If the web shows chat lifetime anywhere, say:
"This chat stays open until a day after the photos develop." Community hubs keep the 24-hour purge.

## 10. Acceptance checklist

- [ ] Pass card appears only for going viewers, before the event ends; pass view works at 320 px.
- [ ] QR stays dark-on-white in dark mode; code is selectable; checked-in state animates in.
- [ ] Wallet button only with `wallet_available` and on Apple browsers.
- [ ] Calendar menu produces valid `.ics` (imports into Apple Calendar, Outlook) and a correct Google link.
- [ ] Maps chooser opens the right app/URL for directions vs place.
- [ ] Weather line never delays first paint; hidden when unavailable.
- [ ] Place-hosted events show the Place as host everywhere; no duplicate "At {place}" row.
- [ ] Scanner handles every `result`, debounces repeats, and is manager-only.
- [ ] Flyer renders both formats with and without an event picture.
