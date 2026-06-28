# Deployment Guide — eRegisters Sync Performance Fix

Branch: `fix/sync-performance-stabilization`

## 1. Files changed

New files:

* `src/sync/config.ts` — sync constants and `resolveUpdatedAfter` helper.
* `src/sync/scheduler.ts` — facility/device sync slotting and jitter.
* `src/sync/lock.ts` — per-browser sync lock.
* `src/sync/retryPolicy.ts` — backoff for 429/5xx/timeout.
* `src/sync/trackerImport.ts` — async tracker import + job polling.
* `src/sync/deletes.ts` — batched/throttled delete imports.
* `src/sync/pullData.ts` — incremental pulls for TE and events.
* `src/sync/telemetry.ts` — local sync diagnostics ring buffer.
* `src/utils/villages.ts` — lazy/cached village loader.
* `scripts/simulate-sync-schedule.ts` — CSV simulation.
* `src/sync/__tests__/*.test.ts` — unit + regression-guard tests.

Modified files:

* `src/machines/sync.ts` — replaced heavy nested pull with the new
  helpers, added lock + telemetry around the pull, kept all existing
  XState states/events so consumers in `routes/` / `components/` work
  unchanged.
* `src/components/village-select.tsx` — uses `loadVillagesWhenNeeded`.

## 2. Behavior changes

* Initial background data pull on app open is **deferred** to the
  facility's scheduled slot (08:00 – 16:00 local time, capped at 2 h).
  Manual sync (`START_DATA_SYNC`, `NETWORK_RECONNECT`) still runs
  immediately.
* `trackedEntities` pull no longer requests `fields=*` and no longer
  nests events. Page size is now 25 (was 100).
* Events are pulled from `tracker/events` with `updatedAfter`.
* Bulk tracker push (`CREATE_AND_UPDATE`, `DELETE`) goes via
  `async=true` and the app polls the tracker job. Small (≤ 10 items)
  clinical saves that pass `forceSync: true` still run synchronously.
* DELETE imports are submitted in batches of 20 with a 1 s gap.
* Multiple tabs/reloads share a lock — only one tab actually runs the
  background pull at a time.

## 3. Backward compatibility notes

* No DHIS2 metadata is changed by the app.
* IndexedDB schemas in `src/db/index.ts` are unchanged. Existing
  offline records remain readable.
* The lock and telemetry use **separate** Dexie databases
  (`MOHRegister_SyncLocks`, `MOHRegister_SyncTelemetry`) so they cannot
  corrupt the main register database.
* XState event names (`PUSH_DATA`, `START_DATA_SYNC`, `FULL_DATA_SYNC`,
  `NETWORK_RECONNECT`, …) are preserved; routes/components do not need
  changes.
* The constant `PROGRAM_UID` matches the existing hard-coded
  `ueBhWkWll5v` literal.

## 4. Staging test plan

1. Build: `pnpm install --ignore-workspace && pnpm test && pnpm build`.
2. Deploy `build/bundle/` to a staging DHIS2 instance under
   `/api/apps/eregisters/`.
3. Open the app as a facility user. Confirm:
   * App becomes usable immediately (no blocking pull).
   * Local data is visible.
   * Status bar (sync-status-comp) shows a sync scheduled for HH:MM
     (or "Background sync is scheduled…").
   * Open three tabs. Only one runs the pull (others see "A sync is
     already running…" if surfaced, or simply no duplicate pulls in
     Network).
4. Trigger a manual sync. Confirm exactly one tracker request goes out,
   with `pageSize=25` and minimal `fields`.
5. Trigger `tracker/events` pull (manual sync). Confirm correct
   `updatedAfter` value.
6. Create + save a tracked entity / event. Confirm immediate save uses
   sync import; bulk batch sync uses `async=true`.
7. Soft-delete events; confirm requests split into batches of 20 with
   `async=true` and `importStrategy=DELETE`.
8. Simulate a 500 response (proxy). Confirm the app does not retry
   immediately; sync status surfaces the deferred-retry message.

## 5. Pilot facility test plan

1. Select 2–3 representative facilities (mixed connectivity).
2. Update only those facilities to the new bundle.
3. Monitor for 24 hours:
   * Local data still readable when offline.
   * Patient search still works.
   * Form data entry/save/sign still works.
   * No regressions in event/enrollment creation.
4. Compare the `localhost_access_log` from the pilot facilities to
   baseline. `fields_star`, `has_events`, `pageSize_100`, and
   `async_false` counts must drop to near zero for those facilities.

## 6. Production deployment plan

1. Schedule deployment for an off-peak window (preferably overnight
   local time).
2. Build the production bundle on CI from the merged PR.
3. Upload the bundle via DHIS2 App Management or `pnpm deploy`.
4. Verify version 1.1.3+ is live on
   `https://eregisters.health.go.ug/api/apps/eregisters/manifest.webapp`.
5. Watch `tomcat10` access logs for the first hour using the commands
   in the spec (see `docs/performance-sync-audit.md` §6 of the spec
   document for the bash recipes).

## 7. Rollback plan

1. Re-upload the previous tested bundle (e.g. `eregisters-1.1.2`) via
   the DHIS2 App Management UI.
2. Validate manifest version on
   `/api/apps/eregisters/manifest.webapp`.
3. Ask facility users to hard refresh (PWA cache invalidation).
4. The fix introduces **no** server-side state changes, so rollback
   requires no database action.

## 8. Post-deployment monitoring

For 48 hours after deployment, run hourly (replace `DATE_HERE`):

```bash
sudo grep "DATE_HERE" /var/log/tomcat10/localhost_access_log.DATE_HERE.txt \
| grep -E '"GET /api/42/tracker/trackedEntities' \
| awk '
/fields=\*/ {fields_star++}
/enrollments/ {enrollments++}
/events/ {events++}
/pageSize=100/ {ps100++}
/updatedAfter=/ {updated_after++}
END {
  print "fields_star:", fields_star+0;
  print "has_enrollments:", enrollments+0;
  print "has_events:", events+0;
  print "pageSize_100:", ps100+0;
  print "updatedAfter:", updated_after+0;
}'
```

```bash
sudo grep "DATE_HERE" /var/log/tomcat10/localhost_access_log.DATE_HERE.txt \
| grep -E '"POST /api/42/tracker' \
| awk '
/async=false/ {sync++}
/async=true/ {async++}
END {
  print "sync_async_false:", sync+0;
  print "async_true:", async+0;
}'
```

Expected after deployment:

* `fields_star` ≈ 0
* `has_events` inside `trackedEntities` ≈ 0
* `pageSize_100` ≈ 0
* `updatedAfter` present on the large majority of normal sync requests
* `async_false` POSTs drop sharply (only small immediate clinical saves
  remain)
* `async_true` POSTs increase (background sync now uses async jobs)
* Total response volume and max request seconds drop substantially.

If any of the above counters do NOT move in the expected direction
within the first peak hour, follow §7 (Rollback).
