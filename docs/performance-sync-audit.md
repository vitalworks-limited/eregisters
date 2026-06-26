# eRegisters Sync Performance Audit

**Date:** 26 Jun 2026
**App:** eRegisters DHIS2 custom app (`/api/apps/eregisters/`)
**DHIS2 version under load:** 2.42.5.1
**Program under load:** Medical Registers (UID `ueBhWkWll5v`)

## 1. Summary of production evidence

Three-hour window 25 Jun 2026 10:00 – 12:59 (`eregisters.health.go.ug`):

| Metric                              | Value     |
| ----------------------------------- | --------- |
| `trackedEntities` GET requests      | 27,987    |
| `tracker` POST requests             | 13,467    |
| `trackedEntities` total response    | ~16 GB    |
| Slowest single GET                  | ~758 sec  |

Hourly app-load curve clearly shows that traffic ramps up only when
facility staff arrive (07:00 → peak 11:00 → tail off after 17:00) and
falls overnight. No CRON pattern.

Dominant tracker pull pattern observed:

```
GET /api/42/tracker/trackedEntities
  program=ueBhWkWll5v
  orgUnits=<facility>
  ouMode=SELECTED
  fields=*,enrollments[*,events[*]]
  pageSize=100
```

Dominant tracker push pattern observed:

```
CREATE_AND_UPDATE async=false   8,005
DELETE          async=false     5,130
UPDATE          async=false        81
CREATE_AND_UPDATE async=true       12
```

## 2. Root cause

The app's sync engine (`src/machines/sync.ts`) used:

1. Heavy nested export — `fields=*,enrollments[*,events[*]]` with
   `pageSize=100`. Each page forced DHIS2 to load and serialize every
   event for every TE, producing multi-MB responses (max ~16 GB cumulative
   in 3 hours).
2. Synchronous tracker imports — `async=false` for both
   `CREATE_AND_UPDATE` and `DELETE` operations. Each call tied up a
   Tomcat/DHIS2 thread for the duration of the import.
3. No facility/device scheduling — every user opening the app at the
   start of the working day immediately fired a heavy data pull, all in
   the same 60-minute window.
4. No per-browser sync lock — multiple tabs / reloads each fired
   independent sync loops.
5. No retry backoff — 500/timeout responses were immediately retried,
   amplifying server load.
6. Large startup payload — `data/villages.min.json` (~11 MB) was fetched
   on first render of any village picker.

## 3. Code paths identified

| Concern                          | File                                  |
| -------------------------------- | ------------------------------------- |
| Tracker pull (TE+enrollments+events) | `src/machines/sync.ts` `pullData` actor |
| Tracker push (sync)              | `src/machines/sync.ts` `submitTrackerImportAndWaitForReport` |
| Tracker delete (sync)            | `src/machines/sync.ts` `syncDeleteToLocal` |
| Background loop scheduling       | `src/machines/sync.ts` `delays.dataPullInterval` |
| Village static load              | `src/components/village-select.tsx`   |

## 4. Exact heavy API patterns found

* `fields=*,enrollments[*,events[*]]` — replaced with minimal field sets
  (`TRACKED_ENTITY_SYNC_FIELDS`, `EVENT_SYNC_FIELDS` in
  `src/sync/config.ts`).
* `pageSize=100` — replaced with `DEFAULT_TRACKER_PULL_PAGE_SIZE = 25`
  (max 50) and `DEFAULT_EVENT_PULL_PAGE_SIZE = 50` (max 100).
* `async: false` for bulk tracker imports — replaced with the helper
  `submitTrackerImportAndAwaitReport` in `src/sync/trackerImport.ts`
  which picks async when `background=true` or payload >
  `BULK_IMPORT_THRESHOLD` (10), and polls the tracker job for the
  report.
* Synchronous DELETE imports — replaced with
  `submitEventDeletes` (`src/sync/deletes.ts`), which batches
  deletes (`DELETE_BATCH_SIZE = 20`) and throttles between batches
  (`DELETE_BATCH_DELAY_MS = 1000`).

## 5. Why it happens during working hours

Production logs confirm the load curve perfectly tracks human working
hours. Facility staff open the eRegisters app between 07:00 and 11:00.
With no scheduling or jitter, every browser starts a heavy
trackedEntities pull within seconds of opening, all targeting the same
DHIS2 instance. The cumulative request count peaks around 11:00–13:00
and tails off as users close the app.

## 6. Why server tuning alone is not the fix

The production server already has:

```
Tomcat maxThreads:              400
DHIS2 connection.pool.max_size: 240
DHIS2 connection.pool.timeout:  30000 ms
PostgreSQL max_connections:     400
```

These are already higher than typical DHIS2 deployments. The bottleneck
is not server capacity per request — it is the volume and shape of
requests the app generates. Pushing those numbers higher would risk
exhausting database connections without solving the underlying
inefficiency. The fix must reduce the number, size, and synchronicity
of tracker requests the app issues.

## 7. Recommended app-side changes

Implemented in branch `fix/sync-performance-stabilization`:

1. **Lighter tracker pull** — minimal fields, page size ≤ 50, never
   request nested events inside trackedEntities.
2. **Separate event pull** — `tracker/events` with `updatedAfter`
   watermark.
3. **Bounded lookback** — initial pull without a watermark uses 24h
   lookback instead of unbounded full sync. Full sync requires explicit
   admin/support action.
4. **Facility/device scheduling** — `src/sync/scheduler.ts` slots
   facilities across 08:00–16:00 with 0–45 min jitter.
5. **Per-browser sync lock** — `src/sync/lock.ts` ensures one sync per
   browser profile even across tabs/reloads.
6. **Retry backoff** — `src/sync/retryPolicy.ts` for 429/5xx/timeouts
   (5 / 15 / 30 min, then manual).
7. **Bulk push async** — `src/sync/trackerImport.ts` uses
   `async=true` and polls job status for any push above
   `BULK_IMPORT_THRESHOLD`.
8. **Delete batching/throttling** — `src/sync/deletes.ts` batches deletes
   into groups of 20 with 1 s spacing, all async.
9. **Lazy villages** — `src/utils/villages.ts` caches and only fetches
   on first picker mount.
10. **Telemetry** — `src/sync/telemetry.ts` keeps a 20-record local ring
    buffer for support diagnostics.

## 8. Risks and mitigations

| Risk                                                | Mitigation |
| --------------------------------------------------- | ---------- |
| Async push delays user feedback                     | Small immediate clinical saves (`forceSync: true`) remain sync. Only bulk background sync goes async. |
| Slot-based scheduling delays sync for late starters | Slots roll over to next day if missed; manual sync remains available; PUSH still runs on `NETWORK_RECONNECT`. |
| Sync lock blocks a stalled tab                      | Lock has a 30-minute TTL; expired locks can be reacquired. |
| Telemetry growth                                    | Ring buffer capped at `MAX_TELEMETRY_RECORDS = 20`. |
| Village lazy load delays first picker render        | Promise is coalesced and cached for the session. |
