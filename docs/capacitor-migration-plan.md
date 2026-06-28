# Capacitor migration plan

Owner: TBD · Status: draft · Last updated: 2026-06-27

## Why

The eRegisters app is a PWA backed by IndexedDB (Dexie). That gives us
offline-capable storage, but with three real failure modes that
field deployments have already hit or will hit:

1. A user (or a parent / colleague using the same phone) taps "Clear
   browsing data" in the device browser. Every record waiting to push
   to DHIS2 is lost.
2. On low-storage Android handsets the OS evicts the WebView cache to
   reclaim space. Same outcome, with no warning.
3. iOS Safari aggressively evicts IndexedDB for sites the user hasn't
   visited in a few days. Same outcome.

The defensive measures already in this branch (`navigator.storage.persist()`,
push-aggressively, "Download local backup" button) reduce the
likelihood. They do not eliminate it. **No purely-web storage API
survives a manual "clear site data" — that's a platform constraint we
cannot work around.**

A thin native shell on top of the existing React UI removes the
constraint. The web bundle stays the source of truth for the UI;
local data moves into native SQLite (encrypted at rest on iOS/Android
by default) and survives any browser-level cache clearing because it
isn't browser-managed storage anymore.

This document scopes that work. It is not a commitment; it is the plan
we hand the team that picks it up.

## Goals

- Same React + antd UI ships unchanged to Android, iOS, and Web.
- Local-record data (tracked entities, enrollments, events,
  rule-result cache) lives in SQLite on native targets.
- Web target keeps Dexie + IndexedDB — Capacitor's web fallback would
  give us no extra durability there.
- Metadata cache (`programs`, `dataElements`, `optionSets`, …) **also**
  moves to SQLite on native, but the existing version-gated probe
  remains the only gate — no behaviour change at the sync layer.
- Background sync on native uses the OS's native background-task APIs
  rather than the Service Worker.
- One CI pipeline produces three artifacts (PWA bundle, `.apk` /
  `.aab`, `.ipa`).

## Non-goals

- Rewriting the UI for native look-and-feel. We deliberately keep antd.
- Replacing tanstack-db. We replace its **adapter**, not the API.
- Building a custom DHIS2 SDK. The existing `@dhis2/app-runtime` keeps
  serving network calls.

## Architecture overview

```
React UI (unchanged)
   │
tanstack-db collections (unchanged API)
   │
  StorageAdapter (new abstraction)
   ├─ web   → tanstack-dexie-db-collection (existing)
   └─ native → tanstack-sqlite-db-collection (new, thin)
                  │
              @capacitor-community/sqlite
                  │
         SQLite file in app-data dir
         (auto-encrypted on iOS via Data Protection,
          AES-256 on Android via SQLCipher)
```

The capacitor side stays minimal — just `@capacitor/core`,
`@capacitor/preferences` (for tiny key/value state we currently keep
in localStorage), `@capacitor-community/sqlite`, and `@capacitor/network`
for online/offline events.

## Phases

### Phase 1 — Wrap the existing PWA in Capacitor (1 day)

- Install Capacitor: `pnpm add @capacitor/core @capacitor/cli`.
- `npx cap init eregisters io.health.eregisters --web-dir build/app`.
- Build the web bundle (`pnpm build`) and copy into `ios/` + `android/`
  Capacitor projects.
- Verify the app loads inside `cap run android` / `cap run ios` (it
  will use IndexedDB at this stage — exactly the current PWA, just
  inside a WebView).

Outcome: native projects exist. UI still uses Dexie. No durability win
yet, but we have a place to plug native storage in.

### Phase 2 — Storage adapter abstraction (2 days)

- Introduce `src/storage/adapter.ts` with the small surface tanstack-db
  collections actually need (`getTable()`, `getKey`, the few utils we
  call). The signatures should mirror the current
  `tanstack-dexie-db-collection` so the rest of the app doesn't change.
- Re-export `dexieCollectionOptions` as
  `defaultCollectionOptions` when running on web, and on native swap to
  a SQLite-backed implementation.
- Add `Capacitor.isNativePlatform()` gate in
  `src/collections/index.ts` to pick the adapter at boot.

Tests:

- Existing collection tests run unchanged on web.
- New native-only tests run under Capacitor's electron / desktop runner
  exercising insert / query / observe.

### Phase 3 — SQLite-backed adapter (3–4 days)

- New package `tanstack-sqlite-db-collection` (in `packages/` or
  inline under `src/storage/sqlite/`).
- Schema: one table per collection (`trackedEntities`, `enrollments`,
  `events`, `rule_results`, `metadata_versions`, `programs`,
  `data_elements`, `option_sets`, `option_groups`,
  `program_rules`, `program_rule_variables`, `organisation_units`).
  Each table has a stringified `key` PK plus a `payload` JSON column
  so we keep the same flattened-record shape we use today.
- Live queries: hook into SQLite's UPDATE/DELETE triggers
  to fire change notifications back to tanstack-db's reactive
  layer. Same eventing pattern Dexie uses.
- Indexes: mirror the Dexie indexes (`orgUnit`, `syncStatus`, the
  composite indexes that `useLiveSuspenseQuery` filters on).
- Encryption: enable SQLCipher key on Android (key stored in
  Android Keystore). iOS gets Data Protection for free under
  `NSFileProtectionComplete`.

### Phase 4 — Background sync (2 days)

- Replace the dev-time service worker with
  `@capacitor/background-runner` on native (web keeps its existing
  service worker).
- Schedule the per-facility 8-slot data pull (already exists in
  `src/sync/scheduler.ts`) through `BackgroundRunner` so the app
  continues to push pending records when the user puts the phone in
  their pocket.
- Add OS-level network change listeners via `@capacitor/network` —
  feeds the same `online`/`offline` events the existing
  `OfflineBanner` and `OnlineIndicator` already react to.

### Phase 5 — Persistence migration (1 day)

- On first native launch after an upgrade from PWA, run a one-shot
  migration: read the existing Dexie tables (still accessible inside
  the WebView), bulk-insert into SQLite, then drop the Dexie copy.
- Surface a one-line toast ("Moved n records to durable storage").
- Add `?factory-reset` debug URL that clears SQLite + Dexie + storage
  state, for support.

### Phase 6 — Build pipeline (2 days)

- One CI workflow:
  - `pnpm build` → web bundle (unchanged).
  - `npx cap sync && cd android && ./gradlew bundleRelease` → `.aab`.
  - `npx cap sync && xcodebuild -workspace ios/App.xcworkspace -scheme App archive` → `.ipa`.
- Signing: Android via Play Console upload key in 1Password →
  GitHub Actions secret; iOS via Apple Developer Program cert in
  `match` repo.
- Publish to internal track in both stores first; promote to closed
  beta after a 1-week soak.

### Phase 7 — Field pilot (≥ 2 weeks)

- One facility per platform. Mirror the same workflows used in the
  current PWA pilot.
- Telemetry already in `src/sync/telemetry.ts` ships with the bundle;
  filter native runs by `appVersion`/`buildHash` to compare against
  PWA.
- Success criteria:
  - Zero "lost unsynced records" support tickets in 30 days.
  - Median time-to-app-ready ≤ web median + 200 ms.
  - Background pull fires on the expected facility slot ≥ 95% of days.

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SQLite schema changes mid-pilot require migrations | Medium | Medium | Ship migrations as part of bundle; gate by `schemaVersion` row. |
| Capacitor + antd 6 styling regressions on iOS WebView | Low | Low | Antd 6 already targets modern WebKit; ship a smoke test app in Phase 1. |
| Background-task quotas on iOS Low Power Mode | Medium | Medium | Fall back to foreground-only push; surface in the sync popover. |
| Play Store / App Store review delays | Medium | Low | Submit to internal track from Phase 6 day 1. |
| Existing Dexie users won't migrate cleanly | Low | High | Phase 5 explicitly tests migration on a populated dataset; back up to JSON before drop. |

## Effort summary

| Phase | Effort |
|---|---|
| 1. Capacitor wrap | 1d |
| 2. Storage adapter abstraction | 2d |
| 3. SQLite adapter | 3–4d |
| 4. Background sync | 2d |
| 5. Persistence migration | 1d |
| 6. Build pipeline | 2d |
| 7. Field pilot soak | 2+ weeks elapsed |

**Engineering cost: ~11–13 dev-days plus pilot soak.**

## Decision

This plan is what we hand to the engineer who picks up "make data
durable on phones." It does **not** block any of the work in the
current branch — the web app keeps shipping, and every defensive
measure already in place (persistent storage request, export-backup
button, version-gated metadata sync) carries over unchanged.

Capacitor work begins when there is a budget for two engineer-weeks
plus three weeks of pilot soak.
