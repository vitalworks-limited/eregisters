# eRegisters Admin UI — Plan

Owner: TBD · Status: draft · Last updated: 2026-06-27

## 1. Why

Facility users (the existing UI) shouldn't have to understand sync,
versions, or quotas. National admins do — and right now they have no
in-app surface for it. They debug from server logs and rely on the
client to behave. We want a deliberately small Admin UI inside the
same eRegisters bundle that:

- Lets a national team see how sync is actually behaving across all
  facilities, without SSHing into anything.
- Lets that team change sync behaviour (windows, rate limits, kill
  switches) without shipping a new build.
- Lets that team broadcast a forced refresh when a critical bundle
  goes out, so already-open sessions don't keep running old code.

The Admin UI is **never** rendered for ordinary clinical users — it's
behind a DHIS2 authority gate.

## 2. Authorities and role gating

DHIS2 supports app-specific authorities declared in
`d2.config.js` / `manifest.webapp` via the
`additionalAuthorities` field. On install, DHIS2 creates the
authorities, and admins assign them through standard User Role
administration.

We introduce two authorities:

| Authority      | Granted to                       | Allows                                                                                     |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------------------ |
| `EREG_USER`    | All clinical staff (default)     | Patient search, registration, visit capture, reports — the entire existing UI.             |
| `EREG_ADMIN`   | A small ops/national team       | Everything `EREG_USER` does **plus** access to the `/admin/*` routes described in §4.       |

Implementation:

- `d2.config.js` gains
  ```js
  additionalAuthorities: ["EREG_USER", "EREG_ADMIN"]
  ```
  so installing or upgrading the app creates the authorities.
- A small `useAuthorities()` hook reads `userInfo.authorities` (already
  available via `useCurrentUserInfo()`); offers `isAdmin`,
  `isUser`, `has(authority)` helpers.
- A route-level `requireAuthority(authority)` guard on the admin
  route subtree redirects unauthorised users to `/tracked-entities`
  with a one-time `message.warning("Admin area requires EREG_ADMIN")`.
- The brand-bar nav gains a "Admin" tab only when `isAdmin === true`.
  Hidden for users; semantically present in source so feature toggles
  remain testable.

Mobile drawer adds the same "Admin" item under the same gate.

## 3. Storage model

All admin config lives in DHIS2 **dataStore** under a single namespace.
Keeps everything portable, auditable, and survives bundle redeploys.

```
GET    /api/dataStore/eregisters-admin
POST   /api/dataStore/eregisters-admin/{key}
PUT    /api/dataStore/eregisters-admin/{key}
DELETE /api/dataStore/eregisters-admin/{key}
```

Keys we'll write:

| Key                  | Shape (TypeScript)                                                                                     | Notes                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `sync-config`        | `{ allowedWindows: TimeWindow[]; blockedWindows: TimeWindow[]; jitterMinutes: number; ... }`           | Read by **all** clients on app start; cached in IndexedDB with a 5 min TTL.            |
| `broadcast`          | `{ buildHash: string; releasedAt: string; severity: "info"\|"forced"; message?: string }`              | Polled by clients in addition to `version.json`; severity=forced bypasses unsaved-data deferrals. |
| `kill-switch`        | `{ pauseAllSync: boolean; reason?: string; setBy: string; setAt: string }`                             | Read by `pullData` and `processBatchSync` — short-circuits both when `true`.            |
| `device-allowlist`   | `{ enabled: boolean; ouFilter?: string[]; userFilter?: string[] }`                                     | Optional pilot/rollout gate; ignored when `enabled === false`.                          |
| `audit-log`          | `Array<{ at: string; who: string; what: string; payload?: unknown }>`                                  | Append-only ring buffer (last 200). Mirrors changes to the other keys.                  |

Clients read the dataStore lazily. The Admin UI is the only writer.

## 4. Pages

All under the `/admin/*` route tree, behind the authority guard.

### 4.1 `/admin` — Dashboard

Single screen, a clinical-style status at a glance:

- **System health** chips: sync window status (green/red), broadcast
  state, kill-switch state.
- **Per-facility snapshot table**: facility, # active devices in last
  24h, last successful pull/push, % devices on latest build.
- **Activity sparkline**: pulls per hour across the country for the
  last 24h.
- **Alerts ribbon**: anything that warrants attention — facilities
  that haven't pushed in 24h, devices stuck on `dataPull.failure`,
  unusual rate spikes.

Drives off the **sync telemetry** records the clients already write
(`src/sync/telemetry.ts`). Today those are local; we'll add an
opt-in `POST /api/dataStore/eregisters-telemetry/{deviceId}` when
admin telemetry is enabled, with the same shape.

### 4.2 `/admin/sync-monitor` — Live sync

Real-time view of in-flight syncs, similar to the existing sync
popover but cross-facility:

- Sortable table: facility · device · user · current step
  (pulling tracked entities, pulling events, pushing) · started ·
  rate (records/s) · status.
- Per-row "force retry" and "abort" actions (sends a small marker to
  dataStore that the client reads in `pullData` and respects).
- Filters: facility, user, status.
- Auto-refresh every 10s.

Powered by the telemetry stream above plus a short-lived
`POST /api/dataStore/eregisters-active-syncs/{deviceId}` heartbeat
each running client writes.

### 4.3 `/admin/logs` — Telemetry log viewer

The same diagnostics the support footer downloads, but server-side:

- Time range picker, severity filter, facility filter.
- Virtualised table (record count can be large).
- Per-row "open raw JSON" drawer.
- "Download as JSON" / "Download as CSV" for ad-hoc analysis.

### 4.4 `/admin/config` — Behaviour

Form-driven editor for `sync-config`:

- **Allowed sync windows** — a UI to define `[{ daysOfWeek, fromLocal, toLocal }]`.
  Example: "weekdays 06:00–18:00 local", "weekends 08:00–14:00".
- **Forbidden windows** — the inverse (e.g., "stay off during
  end-of-month reporting peak").
- **Per-facility rate cap** — max concurrent syncs, max requests/sec,
  consistent with the per-browser lock already in place.
- **Randomised pull jitter** — minutes (default 0–7) added to the
  scheduler's 8-slot hashing so devices don't synchronise to the
  minute. Already implemented in `src/sync/scheduler.ts`; the admin
  UI exposes the magnitude.
- **Backoff curve** — base/min/max for retries (currently 5/15/30 min
  in `src/sync/retryPolicy.ts`).
- **Save** writes to dataStore, audits, and triggers each connected
  client to re-fetch on its next poll.

### 4.5 `/admin/updates` — Broadcast updates

Replaces the current passive `version.json` poll with an explicit
admin-controlled lever:

- Big banner showing the currently broadcast build hash and the
  count of devices still on older hashes (from telemetry).
- "Broadcast latest build" button:
  - Reads `public/version.json` from the freshly deployed bundle.
  - Writes it to `dataStore/eregisters-admin/broadcast`.
  - Choice of severity:
    - **Notify only** — clients show a "Update available" toast.
    - **Forced** — clients run the safe-refresh flow regardless of
      whether the user has unsaved data (a confirm + auto-save is
      attempted first).
- "Revert" button — moves the broadcast key back to the previous
  hash for emergency rollbacks (won't downgrade installed bundles, but
  stops the forced refresh).

The existing `src/update/updateChecker.ts` learns a new source —
the dataStore broadcast key — alongside `version.json`. Default
behaviour stays unchanged when the broadcast key doesn't exist.

### 4.6 `/admin/devices` — Device + user view

- Table of all devices we've ever seen telemetry from
  (`deviceId`, `userUid`, facility, last seen, current build).
- Filters: facility, build hash, "stuck >24h".
- Per-row "Send refresh nudge" (writes a one-shot marker the device
  picks up next poll).

### 4.7 `/admin/audit` — Audit trail

- Append-only feed of admin actions across the other pages.
- Each row: who, when, what changed, before → after diff (JSON).
- Persisted to `audit-log` dataStore key, capped at 200 entries.
- Exportable as JSON for forensic review.

### 4.8 `/admin/help` — In-app runbook

Static markdown rendered inline:

- "How to broadcast a hotfix"
- "How to set a maintenance window"
- "What to do when devices report stuck on dataPull.failure"
- "How to interpret the per-facility snapshot table"

Living document, edited by anyone with repo access.

## 5. Cross-cutting requirements

### 5.1 Client-side enforcement of admin config

Whenever the sync machine starts a pull, it first consults the cached
`sync-config` and the cached `kill-switch`:

```
if (killSwitch.pauseAllSync) return;
if (!inAllowedWindow(now, syncConfig)) return;
if (inBlockedWindow(now, syncConfig)) return;
// proceed
```

This is implemented next to the existing `isSyncBlockedByUpdate()`
guard in `src/update/syncGuard.ts`. The Admin UI only sets the
flags; the existing sync machine consumes them.

The cached `sync-config` is refreshed on every NETWORK_RECONNECT
event and at most every 5 minutes when online.

### 5.2 Authority gating in the router

`requireAuthority()` returns a tanstack-router `beforeLoad` that
throws to redirect non-admins. Route subtree:

```
RootRoute
  AdminRoute            requireAuthority("EREG_ADMIN")
    AdminDashboardRoute
    SyncMonitorRoute
    LogsRoute
    ConfigRoute
    BroadcastUpdatesRoute
    DevicesRoute
    AuditRoute
    HelpRoute
```

The nav also conditionally renders the "Admin" tab via the
`useAuthorities()` hook so non-admins don't see the link.

### 5.3 Visibility into broadcast updates from the user UI

The user-facing sync popover gains a small "Required update" line
when a `forced` broadcast lands and the local bundle is older. Wording
matches the language used in `src/update/safeRefresh.ts` so users
don't see two incompatible flows.

### 5.4 Telemetry transport (server-side)

Today telemetry lives in IndexedDB. To power the dashboard and
sync-monitor pages we'll add an opt-in publisher that batches recent
records and POSTs to dataStore:

```
POST /api/dataStore/eregisters-telemetry/{deviceId}
```

- One row per device, overwritten with the latest 20 records (the
  same ring buffer size already enforced locally).
- Posted opportunistically after every push/pull (~1 KB).
- Gated by `sync-config.telemetryEnabled` (default true); admin can
  disable globally for compliance reasons.

## 6. Phases

| Phase | Deliverable                                            | Effort |
| ----- | ------------------------------------------------------ | ------ |
| 1     | Authorities declared; `useAuthorities` hook; route + nav gating | 1d    |
| 2     | `/admin` shell, dataStore client, audit ring buffer    | 1d     |
| 3     | `/admin/config` + client-side enforcement of windows / kill switch | 2d |
| 4     | `/admin/updates` broadcast + safe-refresh integration  | 1.5d   |
| 5     | Telemetry transport (opt-in) + `/admin/sync-monitor`   | 2d     |
| 6     | `/admin/logs` + `/admin/devices`                       | 1.5d   |
| 7     | `/admin/audit` + `/admin/help`                         | 1d     |
| 8     | Pilot with a single national admin user, 1-week soak   | elapsed |

Total: ~10 dev-days plus pilot soak.

## 7. Risks

| Risk                                                         | Mitigation                                                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| dataStore quotas or write contention with hundreds of devices| Keep keys small (≤ 2 KB); one telemetry key per device; admin polls bounded to every 10s; clients poll every 5 min. |
| Misconfigured allowed/blocked windows lock everyone out      | Server-side default if `sync-config` is missing or malformed; explicit "Reset to defaults" button on Config page. |
| Forced refresh interrupts mid-form work                      | safe-refresh already attempts draft save first; forced mode adds a one-tap "Save now" modal before reload.        |
| Authority creation fails on legacy DHIS2 instances           | Provide a one-line `curl` recipe in the runbook for admins to create the authorities manually post-install.    |
| Admin UI bloats the user bundle                              | Code-split `/admin/*` routes via `React.lazy` so non-admin clients never download them.                          |

## 8. Decision

This plan is what we hand to the engineer who picks up "give the
national team a way to actually run this app." It does **not** block
any user-facing work. It's also possible to ship Phases 1–3 first as a
useful "lights on" admin slice — windows + kill switch — and defer
broadcast updates, telemetry, and audit to a second milestone.
