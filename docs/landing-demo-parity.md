# Landing demo parity

Reviewed against the shared iOS screen implementation in
[`lightningbolts/click` at `b461f6b`](https://github.com/lightningbolts/click/tree/b461f6b4c5c2bce19323c855dcea0f1f8f2d03c6/composeApp/src/commonMain/kotlin/compose/project/click/click)
and the web app on main at `7f1be4c`.

| Demo behavior | Product reference |
| --- | --- |
| iOS tabs: Home, Add Click, Clicks, Map, Me; tab bar steps aside in a thread | `navigation/NavigationItem.kt`, `ui/screens/ConnectionsScreen.kt` |
| Home availability, activity recap, saved events, nearby discovery and connections grouped by location | `ui/screens/HomeScreen.kt`, `HomeScreenCards.kt` |
| Tap, My QR, Scan QR, group creation, hub creation and joining; a successful Click can open chat immediately | `ui/screens/AddClickScreen.kt`, `NfcStateContent.kt` |
| Active / Groups / Archived inbox; groups include community hubs | `ui/screens/ConnectionsListView.kt` |
| Web Home / Clicks / Map / Events navigation with Add Click and Me actions | `lib/shell/appNav.ts`, `components/app-shell/AppShell.tsx` |
| Web Home circle, upcoming plans/events, availability, recap and discovery | `components/home/HomeView.tsx` |
| Web QR identity and app-only Tap explanation | `components/add/AddClick.tsx` |

The preview demonstrates representative flows with local fixtures. It is not an
embedded native app or a complete replica of every screen. Encounters, QR scanning,
group membership, venue presence, event counts and recap history are simulated.
No camera, microphone, Bluetooth or location permission is requested; no account,
chat, event or hub API is called. Map tiles load directly from Carto in the browser.

The phone and web previews share connections, messages, plans, availability,
event saving, RSVPs, route participation, groups and hubs. Saving an event is
independent of RSVP. Reset restores shared fixtures and remounts the local panes
to clear searches, composers and navigation within them.

Native hardware behavior was checked against source; the iOS app itself was not
built or run on this Windows machine. Keep this reference updated when the source
screens or navigation change.
