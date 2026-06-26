# Claude Agent: eRegisters Sync Performance Stabilization and Safe Refactor

## Context

The eRegisters DHIS2 custom app is already cloned locally. Work inside the existing local repository directory. Do not clone the repository again unless the current directory is not the app repository.

Production app observed on the server:

```text
eRegisters custom DHIS2 app
Installed folder: /opt/dhis2/files/apps/eregisters-1.1.3
Production app path: /api/apps/eregisters/
```

Production DHIS2 instance:

```text
DHIS2 version: 2.42.5.1
Main program under load: Medical Registers
Program UID: ueBhWkWll5v
```

The production issue is a DHIS2 performance degradation caused by a high-volume eRegisters tracker sync pattern during working hours.

---

## Mission

You are a senior TypeScript, DHIS2 Tracker, offline-first web app, and performance engineering agent.

Your task is to review, fix, test, and safely refactor the eRegisters custom DHIS2 app so that it no longer overloads DHIS2 during facility sync, while preserving all existing user-facing clinical workflows.

The fix must reduce tracker export/import load without breaking:

- app startup
- login/session behavior
- facility/org unit access
- offline workflows
- client/patient search
- form data entry
- tracked entity create/update
- enrollment create/update
- event create/update
- delete workflows
- metadata sync
- local persistence
- existing DHIS2 permissions
- existing program configuration behavior

Do not remove functionality. Optimize and control sync safely.

---

## Production Evidence

From production access log analysis on `eregisters.health.go.ug`, the eRegisters app is confirmed as the initiating app through repeated loads of:

```text
/api/apps/eregisters/index.html
/api/apps/eregisters/index.html?redirect=false
/api/apps/eregisters/manifest.webapp
/api/apps/eregisters/d2.config.json
/api/apps/eregisters/data/villages.min.json
```

The app generated heavy tracker traffic after users loaded the eRegisters app.

### 3-hour production window: 25 Jun 2026, 10:00-12:59

```text
trackedEntities GET requests: 27,987
tracker POST requests:        13,467
trackedEntities response data: ~16 GB
max trackedEntities request:   ~758 seconds / 12.6 minutes
```

### Hourly app load and tracker activity

```text
hour app_load trackedEntities_GET tracker_POST
00   34        270                 118
01   17        194                  47
02    8        192                  44
03   17        211                  54
04   22        191                  54
05   71        260                  84
06  100        287                  83
07  311        503                 198
08  825       1297                 424
09 2575       5434                2226
10 4111      10152                4399
11 5277       7238                4910
12 4406      10597                4158
13 3437      10936                4926
14 3185       9263                4211
15 2884       7207                3513
16 2156       4504                2568
17 1344       2573                1564
18  779       1885                 905
19  413       1230                 524
20  464        972                 372
21  420        699                 376
22  249        366                 123
23  126        174                 145
```

Conclusion: the issue is not a DHIS2 server CRON. It is an app/user-driven sync storm that starts when facility users open the eRegisters app during working hours.

### Dominant expensive tracker export pattern

The access logs show repeated requests like:

```text
GET /api/42/tracker/trackedEntities
  program=ueBhWkWll5v
  orgUnits=<facility UID>
  ouMode=SELECTED
  fields=*,enrollments[*,events[*]]
  page=<page>
  pageSize=100
  updatedAfter=<sometimes present>
```

Observed counts from 27,987 trackedEntities GET requests:

```text
fields=*              24,046
has enrollments       26,215
has events            24,046
pageSize=100          24,046
updatedAfter          15,755
orgUnitMode SELECTED  24,047
```

This means the app frequently asks DHIS2 to return:

```text
100 tracked entities per page
+ all tracked entity fields
+ all enrollments
+ all events inside each enrollment
```

This is too heavy for routine sync.

### Dominant expensive tracker import pattern

The access logs show repeated synchronous tracker imports:

```text
POST /api/42/tracker?...async=false
```

Observed POST pattern:

```text
CREATE_AND_UPDATE async=false: 8,005
DELETE async=false:            5,130
UPDATE async=false:               81
CREATE_AND_UPDATE async=true:     12
```

Conclusion: bulk imports are mostly synchronous and hold DHIS2/Tomcat resources while processing.

---

## Primary Hypothesis

The eRegisters app currently performs a heavy sync cycle similar to:

```text
User opens app or logs in
→ app starts data sync
→ app pulls trackedEntities using fields=*,enrollments[*,events[*]]
→ app uses pageSize=100
→ app sometimes lacks updatedAfter and performs broad/full pulls
→ app pushes tracker changes using async=false
→ slow/failed requests retry
→ many facilities do this at the same time
→ DHIS2 tracker API, Tomcat threads, Hikari pool, and PostgreSQL become overloaded
```

---

## Files and Code Areas to Inspect First

Start by inspecting:

```text
src/machines/sync.ts
src/machines/sync-metadata-mode.ts
```

Then search the full codebase for:

```text
tracker/trackedEntities
trackedEntities
enrollments[*,events[*]]
fields=*
pageSize
pageSize: 100
pageSize = 100
async: false
async=false
importStrategy
CREATE_AND_UPDATE
DELETE
START_DATA_SYNC
FULL_DATA_SYNC
START_METADATA_SYNC
START_PULL
START_PUSH
lastDataPull
updatedAfter
```

Use:

```bash
grep -R "tracker/trackedEntities\|trackedEntities\|enrollments.*events\|fields.*\*\|pageSize.*100\|async.*false\|importStrategy\|updatedAfter\|lastDataPull" src -n
```

Known problematic patterns are expected to resemble:

```ts
const pageSize = 100;

fields: "*,enrollments[*,events[*]]";

resource: "tracker/trackedEntities";
```

and:

```ts
resource: "tracker",
type: "create",
params: {
  async: false,
  importStrategy: "CREATE_AND_UPDATE",
  atomicMode: "OBJECT",
}
```

---

## Non-Negotiable Safety Rules

Do not break existing features.

Do not remove existing sync capability. Make it efficient, incremental, scheduled, and safe.

Do not silently disable data upload or clinical save workflows.

Do not change DHIS2 metadata from the app unless the current app already does so and the change is explicitly needed.

Do not rely on server-side tuning as the primary fix.

Do not increase Tomcat threads, Hikari pool, or PostgreSQL max connections as a solution.

Known production settings are already high:

```text
Tomcat maxThreads: 400
DHIS2 connection.pool.max_size: 240
DHIS2 connection.pool.timeout: 30000 ms
PostgreSQL max_connections: 400
```

The app is generating excessive tracker traffic. Fix the app.

---

# Required Fixes

## 1. Replace Heavy trackedEntities Payload

### Current problem

The app appears to request:

```text
fields=*,enrollments[*,events[*]]
pageSize=100
```

This causes huge nested tracker payloads and long DHIS2 serialization time.

### Required change

Introduce a sync fields constant, for example:

```ts
export const TRACKED_ENTITY_SYNC_FIELDS = [
  "trackedEntity",
  "trackedEntityType",
  "orgUnit",
  "createdAt",
  "updatedAt",
  "deleted",
  "attributes[attribute,value,updatedAt,createdAt]",
  "enrollments[enrollment,program,orgUnit,status,enrolledAt,occurredAt,updatedAt,deleted]",
].join(",");
```

If the app/DHIS2 client uses different field names, adapt to the actual DHIS2 2.42 tracker API response shape, but preserve the rule:

```text
Do not request *.
Do not nest events inside trackedEntities export.
Request only fields the app truly uses.
```

### Page size rule

Create safe defaults:

```ts
export const DEFAULT_TRACKER_PULL_PAGE_SIZE = 25;
export const MAX_TRACKER_PULL_PAGE_SIZE = 50;
```

Normal sync must never use `pageSize=100` for trackedEntities.

---

## 2. Pull Events Separately and Incrementally

### Current problem

The app pulls events nested inside tracked entities:

```text
enrollments[*,events[*]]
```

This is expensive and repeatedly returns very large event payloads.

### Required change

Create a separate event pull function using the tracker events endpoint, conceptually:

```text
resource: tracker/events
program=<programUid>
orgUnit=<facilityUid>
orgUnitMode=SELECTED
updatedAfter=<timestamp>
pageSize=<safe event page size>
fields=<minimal event fields>
```

Suggested fields:

```ts
export const EVENT_SYNC_FIELDS = [
  "event",
  "program",
  "programStage",
  "orgUnit",
  "status",
  "occurredAt",
  "scheduledAt",
  "updatedAt",
  "createdAt",
  "deleted",
  "enrollment",
  "dataValues[dataElement,value,updatedAt,createdAt]",
].join(",");
```

Adapt field names to the current tracker API if required.

### Event sync rule

Normal sync should be:

```text
1. Pull lightweight tracked entities.
2. Pull lightweight enrollments as part of TE pull or separately.
3. Pull events separately and incrementally.
4. Use updatedAfter watermarks.
5. Never do unbounded event pull on normal app startup.
```

---

## 3. Make Full Sync Explicit and Safe

### Current problem

Some production requests had no `updatedAfter` and started at `page=1`, creating broad/full pulls.

### Required change

Normal sync must always be incremental or bounded.

If `lastDataPull` is missing, use a bounded lookback instead of unbounded full sync:

```ts
function resolveUpdatedAfter(lastDataPull?: string, mode?: SyncMode): string | undefined {
  if (mode === "full-manual-admin") {
    return undefined;
  }

  if (lastDataPull) {
    return lastDataPull;
  }

  const lookbackMs = SYNC_CONFIG.initialLookbackHours * 60 * 60 * 1000;
  return new Date(Date.now() - lookbackMs).toISOString();
}
```

Default bounded lookback:

```text
24 hours
```

Full sync must require explicit user/admin/support action with confirmation.

Add warning:

```text
A full sync may take a long time and may affect system performance. Use only when instructed by support.
```

---

## 4. Add Facility/User/Device Sync Scheduling and Jitter

### Current problem

The app appears to start heavy sync immediately when many users open the app during working hours.

### Required change

Do not run heavy background tracker sync immediately on app open.

Create:

```text
src/sync/scheduler.ts
```

Implement stable facility/user/device slotting:

```ts
function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getFacilitySyncSlot(orgUnitUid: string, slots = 8): number {
  return hashString(orgUnitUid) % slots;
}

export function getSyncDelayMs(params: {
  orgUnitUid: string;
  userUid?: string;
  deviceId?: string;
  maxJitterMinutes?: number;
}) {
  const slot = getFacilitySyncSlot(params.orgUnitUid, 8);
  const baseDelayMinutes = slot * 60;

  const jitterSeed = `${params.orgUnitUid}:${params.userUid ?? ""}:${params.deviceId ?? ""}`;
  const jitterMinutes = hashString(jitterSeed) % (params.maxJitterMinutes ?? 45);

  return (baseDelayMinutes + jitterMinutes) * 60 * 1000;
}
```

Suggested facility sync slots:

```text
slot 0: 08:00-09:00
slot 1: 09:00-10:00
slot 2: 10:00-11:00
slot 3: 11:00-12:00
slot 4: 12:00-13:00
slot 5: 13:00-14:00
slot 6: 14:00-15:00
slot 7: 15:00-16:00
```

Add 0-45 minutes jitter inside each slot.

### User experience

The app should remain usable immediately.

Show sync status like:

```text
App is ready. Background sync is scheduled for HH:MM. You can continue using saved data.
```

Manual sync should remain possible, but it must respect lock, throttling, and retry rules.

---

## 5. Add Per-Device Sync Lock

### Current problem

Multiple tabs, app reloads, and repeated login/app open flows may start duplicate sync jobs.

### Required change

Create:

```text
src/sync/lock.ts
```

Implement an IndexedDB/localForage sync lock with TTL.

Example:

```ts
type SyncLock = {
  lockId: string;
  ownerId: string;
  acquiredAt: string;
  expiresAt: string;
};

export async function acquireSyncLock(
  lockId: string,
  ownerId: string,
  ttlMs: number
): Promise<boolean> {
  const now = Date.now();
  const existing = await storage.getItem<SyncLock>(`sync-lock:${lockId}`);

  if (existing && new Date(existing.expiresAt).getTime() > now) {
    return false;
  }

  await storage.setItem(`sync-lock:${lockId}`, {
    lockId,
    ownerId,
    acquiredAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
  });

  return true;
}

export async function releaseSyncLock(lockId: string, ownerId: string) {
  const existing = await storage.getItem<SyncLock>(`sync-lock:${lockId}`);
  if (existing?.ownerId === ownerId) {
    await storage.removeItem(`sync-lock:${lockId}`);
  }
}
```

Use it around heavy sync:

```ts
const ownerId = `${userUid}:${deviceId}:${Date.now()}`;
const acquired = await acquireSyncLock("background-data-sync", ownerId, 30 * 60 * 1000);

if (!acquired) {
  notify("A sync is already running in another tab or session.");
  return;
}

try {
  await runDataSync();
} finally {
  await releaseSyncLock("background-data-sync", ownerId);
}
```

Acceptance criterion:

```text
Opening three tabs must not start three tracker pull loops.
```

---

## 6. Add Retry Backoff and Failure Control

### Current problem

Slow requests return 500 after several minutes. Immediate retry amplifies server load.

### Required change

Create:

```text
src/sync/retryPolicy.ts
```

Implement:

```ts
export function getRetryDelayMs(failureCount: number): number | null {
  if (failureCount <= 0) return 0;
  if (failureCount === 1) return 5 * 60 * 1000;
  if (failureCount === 2) return 15 * 60 * 1000;
  if (failureCount === 3) return 30 * 60 * 1000;
  return null;
}
```

For these responses, do not retry immediately:

```text
429
500
502
503
504
network timeout
connection timeout
```

Show user-facing message:

```text
Sync is delayed because the server is busy. The app will retry later. You can continue using saved local data.
```

After three failed automatic retries, stop and require manual retry.

---

## 7. Convert Bulk Tracker Push to Async

### Current problem

Production showed most tracker POSTs using:

```text
async=false
```

This ties up Tomcat/DHIS2 request threads while imports process.

### Required change

For bulk background sync push, use:

```ts
params: {
  async: true,
  importStrategy: "CREATE_AND_UPDATE",
  atomicMode: "OBJECT",
  reportMode: "ERRORS",
  skipPatternValidation: true,
  skipSideEffects: true,
}
```

Then poll the tracker job status.

If the repo already has tracker job polling helpers, reuse them. Otherwise implement:

```text
1. submit async tracker import
2. extract job id from response
3. poll job endpoint every 5-10 seconds
4. stop polling after timeout
5. store pending job locally
6. resume polling after app reload
```

Important distinction:

```text
Small immediate clinical save operations may remain synchronous if the UI requires immediate validation.
Bulk background sync must use async=true.
```

Suggested threshold:

```ts
const BULK_IMPORT_THRESHOLD = 10;
```

If payload count is greater than 10, use async.

---

## 8. Batch and Throttle DELETE Imports

### Current problem

Production showed thousands of synchronous DELETE imports.

### Required change

Batch deletes:

```ts
const DELETE_BATCH_SIZE = 20;
const DELETE_BATCH_DELAY_MS = 1000;
```

Use async for bulk delete if supported:

```ts
params: {
  async: true,
  importStrategy: "DELETE",
  atomicMode: "OBJECT",
  reportMode: "ERRORS",
}
```

Do not repeatedly submit the same delete if already pending or submitted.

Use local state:

```ts
type PendingDelete = {
  uid: string;
  type: "event" | "trackedEntity" | "enrollment";
  firstQueuedAt: string;
  lastAttemptAt?: string;
  status: "pending" | "submitted" | "confirmed" | "failed";
  attempts: number;
  lastError?: string;
};
```

---

## 9. Reduce Startup Payload

### Current problem

The app loads large static payloads, including:

```text
/api/apps/eregisters/data/villages.min.json
```

One observed response was approximately 11 MB.

### Required change

Review startup loading and optimize.

Rules:

```text
1. Do not block app readiness on villages.min.json unless required immediately.
2. Lazy-load village data only when a form/search needs it.
3. Cache static files aggressively if they are versioned.
4. Split very large static files by region/district/facility if practical.
5. Ensure gzip/brotli compression is effective server-side.
```

In app code, introduce a lazy loader:

```ts
async function loadVillagesWhenNeeded(orgUnitPath?: string) {
  // Load only when the specific form/search requires village data.
}
```

---

## 10. Add Sync Telemetry and Diagnostics

Create:

```text
src/sync/telemetry.ts
```

Capture local sync telemetry:

```ts
type SyncTelemetry = {
  syncId: string;
  userUid?: string;
  username?: string;
  orgUnitUid?: string;
  appVersion?: string;
  startedAt: string;
  finishedAt?: string;
  mode: "metadata" | "data-pull" | "data-push" | "full" | "manual";
  pagesPulled?: number;
  trackedEntitiesPulled?: number;
  eventsPulled?: number;
  payloadBytesApprox?: number;
  trackerPosts?: number;
  asyncJobsCreated?: number;
  failures?: Array<{
    at: string;
    endpoint?: string;
    status?: number;
    message: string;
  }>;
};
```

Store last 20 sync telemetry records locally.

Add a support/debug function:

```text
Download sync diagnostics
```

This should help identify future facility/device-specific sync issues.

---

# Tests Required

Add or update tests for all sync changes.

## Unit tests

Required tests:

```text
1. Normal tracked entity sync does not include fields=*.
2. Normal tracked entity sync does not include events[*].
3. Normal tracked entity sync uses pageSize <= 50.
4. Normal sync includes updatedAfter when lastDataPull exists.
5. Missing lastDataPull uses bounded lookback, not unbounded full sync.
6. Full sync requires explicit manual/admin mode.
7. Facility sync slot is stable for a given orgUnit UID.
8. Jitter differs across devices/users.
9. Sync lock prevents duplicate concurrent sync.
10. Retry policy backs off after 500/502/503/504/429.
11. Bulk push uses async=true.
12. Small immediate save may remain synchronous only if explicitly allowed.
13. Delete batching splits large delete lists into safe batch sizes.
14. Multiple app initializations do not start multiple background syncs.
```

## Integration or mocked API tests

Required tests:

```text
1. App startup loads without starting heavy tracker pull immediately.
2. Manual sync runs one controlled sync only.
3. Failed 500 response does not immediately retry.
4. Async tracker import creates job and polls status.
5. Existing data entry save workflow still works.
6. Existing client search still works.
7. Existing offline/local records remain readable after migration.
```

## Regression guard

Add tests or static checks that fail if routine sync reintroduces:

```text
fields=*,enrollments[*,events[*]]
pageSize=100
async=false in bulk/background sync
```

Do not globally ban `async=false`; only prevent it in bulk/background sync paths.

---

# Build and Verification

Detect the package manager from lock files.

If Yarn:

```bash
yarn install
yarn test
yarn build
```

If npm:

```bash
npm install
npm test
npm run build
```

If pnpm:

```bash
pnpm install
pnpm test
pnpm build
```

Fix all type errors, lint errors, and test failures.

---

# Performance Validation

Add a mock performance/scheduling test or script simulating:

```text
100 facilities
3 users per facility
all opening app within the same hour
```

Before the fix, this would start many immediate heavy syncs.

After the fix, verify:

```text
1. heavy sync start times are distributed across slots;
2. each browser/device has at most one active sync;
3. trackedEntities request uses minimal fields;
4. trackedEntities pageSize <= 50;
5. events are pulled separately;
6. bulk writes use async=true;
7. failed requests back off.
```

Add if appropriate:

```text
scripts/simulate-sync-schedule.ts
```

Expected output:

```text
facilityUid, slot, scheduledSyncTime, jitterMinutes
```

---

# Documentation Deliverables

Create:

```text
docs/performance-sync-audit.md
docs/deployment-sync-performance-fix.md
```

## docs/performance-sync-audit.md must include

```text
1. Summary of production evidence.
2. Root cause.
3. Code paths identified.
4. Exact heavy API patterns found.
5. Why the issue happens during working hours.
6. Why server tuning alone is not the fix.
7. Recommended app-side changes.
8. Risks and mitigations.
```

## docs/deployment-sync-performance-fix.md must include

```text
1. Files changed.
2. Behavior changes.
3. Backward compatibility notes.
4. Staging test plan.
5. Pilot facility test plan.
6. Production deployment plan.
7. Rollback plan.
8. Post-deployment monitoring commands.
```

---

# Post-Deployment Monitoring Commands

Use production Tomcat access logs to compare before/after.

## Check heavy trackedEntities fields

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

Expected after fix:

```text
fields_star: near 0
has_events inside trackedEntities: near 0
pageSize_100: near 0
updatedAfter: high percentage of normal sync requests
```

## Check POST async behavior

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

Expected after fix:

```text
bulk async_false should drop sharply
async_true should increase for background sync jobs
```

## Check hourly app and tracker pattern

```bash
sudo grep "DATE_HERE" /var/log/tomcat10/localhost_access_log.DATE_HERE.txt \
| awk '
{
  split($4,t,":");
  hour=t[2];

  if ($0 ~ /\/api\/apps\/eregisters\/index.html/) app_load[hour]++;
  if ($0 ~ /GET \/api\/42\/tracker\/trackedEntities/) te_get[hour]++;
  if ($0 ~ /POST \/api\/42\/tracker/) tracker_post[hour]++;
}
END {
  print "hour app_load trackedEntities_GET tracker_POST";
  for (h=0; h<24; h++) {
    hh=sprintf("%02d", h);
    print hh, app_load[hh]+0, te_get[hh]+0, tracker_post[hh]+0;
  }
}'
```

Expected after fix:

```text
Tracker sync should be smoother across hours.
The 09:00-14:00 spike should reduce.
```

## Check response payload volume

```bash
sudo grep "DATE_HERE" /var/log/tomcat10/localhost_access_log.DATE_HERE.txt \
| grep -E '"GET /api/42/tracker/trackedEntities' \
| awk '
{
  for (i=1; i<=NF; i++) {
    if ($i ~ /^catalina-exec-/) {
      bytes=$(i-2);
      rt=$(i-1);
      if (bytes != "-") total_bytes += bytes;
      total++;
      if (bytes > max_bytes) max_bytes=bytes;
      if (rt > max_rt) max_rt=rt;
      break;
    }
  }
}
END {
  printf "requests: %d\n", total;
  printf "total_response_MB: %.2f\n", total_bytes/1024/1024;
  printf "max_response_MB: %.2f\n", max_bytes/1024/1024;
  printf "max_request_seconds: %.2f\n", max_rt/1000000;
}'
```

Expected after fix:

```text
total_response_MB should reduce substantially
max_response_MB should reduce
max_request_seconds should reduce
```

---

# Branch and PR Requirements

Create branch:

```bash
git checkout -b fix/sync-performance-stabilization
```

Commit cleanly with meaningful messages.

Suggested commits:

```text
1. docs: add production sync performance audit
2. refactor(sync): add sync configuration and safe field constants
3. fix(sync): reduce tracked entity pull payload and page size
4. feat(sync): add separate incremental event sync
5. feat(sync): add facility sync scheduler and jitter
6. feat(sync): add browser sync lock
7. feat(sync): add retry backoff
8. feat(sync): use async tracker import for bulk push
9. feat(sync): batch and throttle deletes
10. perf(startup): lazy-load large static village data
11. test(sync): add performance and regression tests
12. docs: add deployment and monitoring guide
```

---

# Pull Request Description Template

Use this PR body:

```markdown
## Summary

This PR fixes the eRegisters sync storm that overloaded DHIS2 tracker APIs during working hours.

## Production Root Cause

The app was pulling tracker data using:

- `fields=*,enrollments[*,events[*]]`
- `pageSize=100`
- nested events inside trackedEntities exports
- bulk tracker imports using `async=false`
- heavy sync starting immediately on app load/login

This generated very large tracker payloads and many synchronous imports.

## Changes

- Replaced heavy trackedEntities payload with minimal fields.
- Removed nested `events[*]` from trackedEntities sync.
- Added separate incremental event sync.
- Reduced routine trackedEntities page size.
- Added bounded lookback when sync watermark is missing.
- Made full sync explicit/manual/admin-controlled.
- Added facility/device sync scheduling and jitter.
- Added per-device/browser sync lock.
- Added retry backoff for server errors/timeouts.
- Converted bulk tracker imports to async jobs.
- Batched and throttled delete imports.
- Optimized large startup payload handling.
- Added sync telemetry/diagnostics.
- Added regression tests.

## Safety

Existing clinical workflows preserved:

- app loading
- search
- data entry
- local/offline records
- create/update events
- delete events
- metadata sync
- org unit permissions

## Tests

- Unit tests added for sync fields, page size, jitter, lock, retry, async bulk imports, and delete batching.
- Build passes.
- Mock sync simulation shows distributed sync starts and reduced payload size.

## Deployment Plan

1. Deploy to staging.
2. Test with selected pilot facilities.
3. Compare access logs before/after.
4. Deploy to production off-peak.
5. Monitor first 24 hours.

## Post-Deployment Monitoring

Monitor:

- trackedEntities GET count
- `fields=*` count
- nested `events[*]` count
- `pageSize=100` count
- `async=false` POST count
- total response MB
- max request seconds
- 500 errors
```

---

# Final Acceptance Criteria

The task is complete only when all are true:

```text
1. Normal sync no longer uses fields=*,enrollments[*,events[*]].
2. Normal sync no longer pulls events nested inside trackedEntities.
3. Normal sync no longer uses pageSize=100.
4. Normal sync uses updatedAfter or bounded lookback.
5. Full sync requires explicit manual/admin action.
6. App startup does not immediately launch heavy sync for all users.
7. Facility/device jitter spreads sync load.
8. Browser/device sync lock prevents duplicate concurrent sync.
9. Failed server requests use retry backoff.
10. Bulk tracker push uses async=true.
11. Delete imports are batched and throttled.
12. Large static startup data is lazy-loaded or cached safely.
13. Existing clinical workflows still work.
14. Tests pass.
15. Build passes.
16. Documentation is complete.
```
