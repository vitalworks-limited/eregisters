# Claude Agent: eRegisters DHIS2 Admin UI Intelligent Troubleshooting Implementation

## 1. Agent Identity

You are Claude acting as a senior DHIS2 App Platform engineer, DHIS2 tracker performance specialist, PostgreSQL/Tomcat observability engineer, and frontend product architect. Your task is to implement a complete Admin UI inside the custom DHIS2 eRegisters app that exposes intelligent troubleshooting, sync health, operational insights, national-level monitoring, and guided remediation for the eRegisters production environment.

This agent must work directly inside the cloned eRegisters codebase and must not break existing user-facing data capture functionality. The implementation must be production-safe, role-aware, performant, and compatible with DHIS2 2.42.x API behavior.

## 2. Background Context

The eRegisters custom DHIS2 app has been observed to generate heavy tracker sync load against DHIS2 tracker endpoints. Prior troubleshooting identified that recurrent working-day slowness is mainly caused by application sync behavior, not by PostgreSQL lock timeout, Tomcat thread limits, or normal DHIS2 scheduled CRON jobs.

The app has been observed to request large tracker payloads using the pattern:

```text
GET /api/42/tracker/trackedEntities
  program=ueBhWkWll5v
  orgUnits=<facility UID>
  ouMode=SELECTED
  fields=*,enrollments[*,events[*]]
  page=<page>
  pageSize=100
```

The app has also been observed to push tracker writes with `async=false`, creating sustained pressure on DHIS2, Tomcat, PostgreSQL, and network bandwidth.

Important production identifiers to preserve as configurable defaults, not hardcoded assumptions:

```text
DHIS2 host: eregisters.health.go.ug
Primary app path: /api/apps/eregisters/
Observed installed folder: /opt/dhis2/files/apps/eregisters-1.1.3
Main tracker program UID: ueBhWkWll5v
Main tracker program name: Medical Registers
Target DHIS2 API version: 42 where available, with fallback to server-discovered API version
```

## 3. Primary Goal

Implement a complete **Admin UI** inside the eRegisters DHIS2 app with the following sections:

1. Overview
2. Sync activity
3. Users
4. Data capture
5. Logs
6. Config
7. Insights

The Admin UI must incorporate intelligent troubleshooting findings, nationally aggregated visibility, facility-level drill-downs, user-level diagnostics, sync-risk scoring, guided recommendations, and safe operational controls.

The Admin UI is not only a static dashboard. It must become a practical operations console that helps national, regional, district, and facility support teams detect, explain, and resolve eRegisters sync and performance issues.

## 4. Non-Negotiable Requirements

### 4.1 Do not break existing features

Before making changes:

- Inspect the full codebase.
- Identify current routing, state management, API client implementation, storage layer, sync engine, auth/authority checks, app manifest, service worker, and build pipeline.
- Create a change plan before modifying files.
- Keep all existing user-facing workflows working.
- Add tests for any changed sync or API behavior.
- Do not remove or rename existing routes without redirects.

### 4.2 Role-aware access

The Admin UI must be restricted. Implement role and authority checks based on DHIS2 current user authorities, user groups, and data view organisation units.

Create access levels:

| Access level | Typical user | Scope |
|---|---|---|
| National admin | MOH/HISP national support | National summary, all regions/districts/facilities, system-wide troubleshooting |
| Regional/District supervisor | Regional/district support | Assigned org unit subtree only |
| Facility admin | Facility lead | Facility and own users only |
| Support analyst | HISP technical support | Diagnostic views, logs, exportable evidence, no destructive actions unless authorised |
| Normal data capture user | Facility user | No Admin UI unless explicitly granted |

Never expose sensitive clinical content in the Admin UI. Display operational metadata only: counts, timings, endpoint types, sync status, anonymised or role-filtered user information, org unit names, device/session metadata where appropriate, and technical diagnostics.

### 4.3 Production safety

- No direct destructive DHIS2 database operations from the frontend.
- No direct shell execution from the frontend.
- No display of database credentials, tokens, cookies, authorization headers, or full patient payloads.
- No clinical data values in logs, exports, or troubleshooting summaries.
- Any remediation action must be safe, reversible, audited, and permission controlled.

### 4.4 App update propagation

Implement mechanisms so that newly installed app updates take effect in already-open app sessions without users manually refreshing.

Minimum requirements:

- Version manifest or build metadata endpoint/file bundled with the app.
- Periodic version check with configurable interval.
- Service worker/cache invalidation where applicable.
- In-app “Update available” banner with automatic safe reload option.
- Forced reload only when safe; do not interrupt unsaved data capture.
- BroadcastChannel or localStorage event to notify all open tabs.
- Cache-busting for Admin UI assets and configuration JSON.

## 5. Technical Findings to Convert into Admin UI Intelligence

The Admin UI must turn prior troubleshooting evidence into live, understandable diagnostics.

### 5.1 Root cause intelligence

Build a root cause analyzer that can classify performance issues using available signals.

Required root cause categories:

| Category | Detection signal | Admin UI explanation |
|---|---|---|
| Sync storm | High tracker GET/POST volume per minute, many users/facilities syncing together | Many clients are syncing at the same time and overloading DHIS2 |
| Expensive export pattern | `fields=*`, nested `enrollments[*,events[*]]`, large `pageSize`, missing `updatedAfter` | The app is requesting too much data per sync call |
| Synchronous imports | High `POST /tracker` with `async=false` | Tracker writes are blocking request threads until complete |
| Delete storm | High DELETE imports | Many deletions or reconciliation operations are being sent and should be batched/throttled |
| Scheduler pressure | Many scheduled/running tracker jobs or stale jobs | DHIS2 scheduler may be slowed by tracker import job backlog |
| Hikari pressure | Connection timeout-like symptoms, DB wait, leaked connection warnings from diagnostics source | DB connections may be occupied by heavy tracker operations |
| Facility hotspot | One or more facilities dominate traffic | Specific org units need targeted support or sync throttling |
| User hotspot | One or more users/devices dominate requests | User/device may have repeated reloads, failed sync retries, or multiple tabs |
| App version drift | Different users running old app versions | Some open sessions are not using the latest code |
| Metadata/config issue | Invalid config, missing mappings, missing org unit/program access | Sync or capture may fail because metadata is not aligned |

### 5.2 Risk scoring

Implement a transparent scoring system for national and facility-level health.

Overall health score: 0-100.

Suggested scoring model:

```text
100 = healthy
-20 if tracker GET/minute exceeds configured threshold
-20 if tracker POST/minute exceeds configured threshold
-15 if >20% tracker exports lack updatedAfter
-15 if >20% tracker exports use fields=* or nested events
-15 if synchronous imports exceed configured threshold
-10 if sync failures exceed configured threshold
-10 if stale/running jobs detected
-10 if app version drift detected
-10 if top 5 facilities produce >50% traffic
Minimum score = 0
```

Show score bands:

| Score | Label | Meaning |
|---|---|---|
| 85-100 | Healthy | Normal operations |
| 70-84 | Watch | Monitor and validate sync behavior |
| 50-69 | Degraded | Performance risk; support action needed |
| 0-49 | Critical | Active or likely sync storm/system pressure |

## 6. Admin UI Section Requirements

## 6.1 Overview

Purpose: Provide a national operational command view.

Implement cards and charts for:

- National health score.
- Current sync status: healthy, delayed, degraded, critical.
- Active facilities syncing now.
- Active users/devices in the last 15 minutes, 1 hour, 24 hours.
- Tracker GET count and POST count by time window.
- Estimated response payload generated by tracker exports.
- Slow request indicators where available.
- Failed sync count.
- Pending local sync queue count aggregated from reported clients.
- App version distribution.
- DHIS2 server/API version.
- Main program UID/name and configured sync scope.
- Last successful national sync cycle.
- Top 10 noisy facilities.
- Top 10 noisy users/devices, role-filtered.
- Top detected risks with recommended action.

Required national drill-down hierarchy:

```text
National -> Region -> District -> Facility -> User/Device -> Sync session/request batch
```

Use the current user’s accessible org units to restrict the hierarchy.

## 6.2 Sync Activity

Purpose: Explain what the app is doing during sync.

Implement:

- Sync timeline by minute/hour/day.
- Pull vs push split.
- Entity sync, enrollment sync, event sync, deletion sync, metadata sync.
- Queue status: pending, running, completed, failed, retrying, blocked.
- Last sync by facility and user.
- Sync duration distribution.
- Retry count and backoff state.
- Conflict count and duplicate detection count.
- Async tracker job status where available.
- Detection of unsafe request patterns:
  - `fields=*`
  - nested `events[*]` inside trackedEntities
  - `pageSize > configured maximum`
  - missing `updatedAfter`
  - `async=false` for bulk tracker imports
  - repeated DELETE imports
  - repeated same request from same user/device
  - multiple open tabs from same browser/device

Required remediation guidance:

- “Reduce payload fields”
- “Fetch events separately”
- “Apply updatedAfter”
- “Reduce page size”
- “Switch bulk imports to async=true”
- “Enable jitter/backoff”
- “Stop duplicate tab sync”
- “Review facility configuration”

## 6.3 Users

Purpose: Support national and facility teams to identify operational sync patterns without exposing clinical data.

Implement:

- User list with filters: national/region/district/facility, role, user group, last active, app version, sync status, failure count.
- User detail page:
  - assigned org units
  - data view org units
  - last app open
  - last sync start/end
  - sync queue summary
  - app version
  - browser/device fingerprint hash, not raw fingerprint where avoidable
  - active tabs/sessions estimate
  - recent non-clinical errors
  - retry/backoff status
  - permission/config warnings
- Identify high-risk user patterns:
  - excessive reloads
  - multiple tabs
  - repeated failed imports
  - old app version
  - no updatedAfter in sync
  - unusually high delete count

Do not expose passwords, tokens, cookies, or patient data.

## 6.4 Data Capture

Purpose: Show operational quality and completeness of capture workflows.

Implement:

- Facility capture activity summary.
- Drafts/pending local records count.
- Submitted tracker import count.
- Failed validation count.
- Duplicate UID conflict count.
- Missing mandatory metadata/config warnings.
- Program/rule processing errors summary.
- Capture activity by program stage or register section.
- Data entry timeliness indicators.
- Completeness by facility where derivable without exposing individual records.
- “Facilities with no recent capture activity” report.
- “Facilities with capture but failed sync” report.

The UI must clearly distinguish:

- data captured locally but not synced;
- data submitted to DHIS2;
- data rejected by DHIS2 validation/import;
- data requiring user correction;
- data requiring admin/configuration correction.

## 6.5 Logs

Purpose: Provide searchable, role-filtered, privacy-safe operational logs.

Implement app-side logs and DHIS2-accessible diagnostics where possible.

Log categories:

- App load logs.
- Sync request logs.
- Sync response logs.
- Queue operation logs.
- Retry/backoff logs.
- Conflict logs.
- Validation/import summary logs.
- Version/update logs.
- Configuration changes.
- Admin remediation actions.
- Error boundaries and frontend exceptions.

Log fields:

```text
timestamp
level: debug | info | warn | error | critical
category
facilityUid
facilityName
userUid
username or displayName where allowed
sessionId
appVersion
endpointGroup, not full sensitive URL by default
method
statusCode
durationMs
payloadSizeBytes if known
requestPatternFlags
summary
recommendedAction
correlationId/requestId if available
```

Required features:

- Search and filters.
- Export CSV/JSON for support evidence.
- Copy troubleshooting bundle.
- Mask sensitive values.
- Retention controls.
- Local-only log purge.
- National log summary with drill-down.

Where server-side access logs are not available to the browser, create an import mechanism for support teams to upload sanitized log summaries generated by server scripts. The Admin UI should parse those summaries and show them in Insights and Logs.

## 6.6 Config

Purpose: Give administrators safe control over sync behavior and operational thresholds.

Implement configuration screens for:

### Sync safety settings

```text
maxTrackerPullPageSize: default 25 or 50
requireUpdatedAfterForNormalSync: true
updatedAfterLookbackHours: configurable
allowFullSync: restricted to admins and off-peak windows only
fullSyncCooldownHours: configurable
syncJitterMinSeconds
syncJitterMaxSeconds
singleDeviceSyncLockEnabled: true
multiTabSyncProtectionEnabled: true
retryBackoffEnabled: true
retryBaseDelaySeconds
retryMaxDelayMinutes
bulkImportAsyncEnabled: true
maxDeleteBatchSize
maxConcurrentTrackerRequestsPerDevice
maxConcurrentTrackerRequestsPerFacility
```

### Troubleshooting thresholds

```text
trackerGetPerMinuteWarning
trackerGetPerMinuteCritical
trackerPostPerMinuteWarning
trackerPostPerMinuteCritical
slowRequestMsWarning
slowRequestMsCritical
payloadMbWarning
syncFailureRateWarning
facilityHotspotPercentage
appVersionDriftWarning
staleJobAgeMinutes
```

### National hierarchy settings

- National root org unit.
- Region level.
- District level.
- Facility level.
- Support user groups.
- Admin authorities.
- Default dashboard scope.

### Feature flags

- Enable Admin UI.
- Enable national overview.
- Enable facility drill-down.
- Enable local sync logging.
- Enable sanitized troubleshooting bundle export.
- Enable server log import.
- Enable automatic update prompt.
- Enable forced reload after safe checkpoint.

Configuration storage options, in order of preference:

1. DHIS2 Data Store namespace dedicated to eRegisters admin config.
2. DHIS2 App Runtime dataStore API wrapper.
3. Local fallback for non-admin development only.

All config changes must be audited.

## 6.7 Insights

Purpose: Provide intelligent troubleshooting summaries and actionable recommendations.

Implement an Insights engine with:

- Root cause cards.
- Evidence summary.
- Severity score.
- Affected scope: national/region/district/facility/user.
- Recommended action.
- Owner: developer, DHIS2 admin, facility supervisor, support team.
- Urgency: now, today, this week, next release.
- Confidence level based on evidence.

Example insight card:

```text
Title: Potential sync storm detected
Severity: Critical
Scope: National
Evidence:
- Tracker GET rate exceeded configured threshold for 30 minutes
- 68% of exports used nested events
- 43 facilities started sync within 10 minutes
Likely cause:
- App load is triggering simultaneous large sync jobs
Recommended action:
- Enable jitter, sync lock, and updatedAfter requirement
- Review top 10 facilities in Sync Activity
- Validate latest app version adoption
```

The Insights engine must support both live app telemetry and imported support evidence.

## 7. Backend/API and Data Architecture

Because a DHIS2 custom app runs in the browser and does not directly access Tomcat/PostgreSQL logs, implement a layered architecture:

### 7.1 App telemetry collector

Create a client-side telemetry service that records operational events locally and, where configured, stores aggregated operational summaries in DHIS2 Data Store.

Do not store clinical payloads.

Telemetry event examples:

```ts
type EregisterTelemetryEvent = {
  id: string;
  timestamp: string;
  appVersion: string;
  userUid?: string;
  orgUnitUid?: string;
  sessionId: string;
  category: 'app_load' | 'sync_pull' | 'sync_push' | 'queue' | 'error' | 'config' | 'version';
  level: 'debug' | 'info' | 'warn' | 'error' | 'critical';
  endpointGroup?: 'trackedEntities' | 'events' | 'trackerImport' | 'metadata' | 'me' | 'apps' | 'other';
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  durationMs?: number;
  statusCode?: number;
  payloadSizeBytes?: number;
  requestPatternFlags?: {
    fieldsAll?: boolean;
    nestedEnrollments?: boolean;
    nestedEvents?: boolean;
    pageSize?: number;
    missingUpdatedAfter?: boolean;
    asyncFalse?: boolean;
    deleteImport?: boolean;
  };
  summary: string;
  recommendedAction?: string;
};
```

### 7.2 Aggregation layer

Store aggregated summaries rather than raw logs by default.

Suggested Data Store namespaces:

```text
eregisters-admin-config
eregisters-admin-telemetry-daily
eregisters-admin-telemetry-hourly
eregisters-admin-insights
eregisters-admin-support-evidence
eregisters-admin-audit
```

Suggested keys:

```text
config
audit-YYYY-MM-DD
national-summary-YYYY-MM-DD
orgunit-<uid>-YYYY-MM-DD
user-<uid>-YYYY-MM-DD
insights-YYYY-MM-DD
support-evidence-<uploadId>
```

### 7.3 Server evidence import

Create an Admin UI feature to upload sanitized JSON/CSV evidence generated from server-side grep/SQL scripts.

Supported imports:

- Tomcat access log summary.
- Tracker GET/POST volume by minute.
- Expensive request pattern counts.
- Top org units/facilities.
- Top users/IPs.
- Tracker job backlog summary.
- Hikari warning summary.
- PostgreSQL error summary.
- App version folder/check summary.

The UI must validate schema, show preview, store sanitized summaries, and use them in Insights.

## 8. Sync Engine Refactor Requirements

The Admin UI must not only observe problems. The agent must also refactor app sync behavior where necessary so the app no longer creates the documented pressure pattern.

Implement or verify the following:

### 8.1 Tracker pull optimization

- Remove `fields=*` from normal sync.
- Do not request `enrollments[*,events[*]]` inside normal trackedEntities export.
- Fetch tracked entities, enrollments, and events in separate bounded calls.
- Require `updatedAfter` for normal incremental sync.
- Allow full sync only as a controlled admin action with warning and off-peak scheduling.
- Reduce normal page size to 25 or 50.
- Add request cancellation and timeout handling.
- Deduplicate repeated GET requests.

### 8.2 Tracker push optimization

- Use `async=true` for bulk tracker imports.
- Poll job status safely.
- Batch CREATE_AND_UPDATE imports.
- Batch and throttle DELETE imports.
- Add idempotency/deduplication before submit.
- Prevent duplicate submit from multiple tabs.
- Apply exponential backoff after 429/500/502/503/504/timeouts.

### 8.3 Multi-tab and device protection

- Implement a sync lock using IndexedDB/localStorage with expiry.
- Use BroadcastChannel to coordinate tabs.
- Only one tab should run sync per browser profile.
- Other tabs should show sync status but not duplicate sync.
- Release lock safely after success, failure, timeout, or tab close.

### 8.4 Jitter and scheduling

- Do not sync all users immediately on app load.
- Apply randomized jitter based on configured min/max.
- Stagger facility/device sync.
- Support quiet/off-peak scheduling for full sync.

## 9. Frontend Implementation Requirements

### 9.1 UI framework

Use the existing eRegisters frontend stack. If the app uses React and DHIS2 App Runtime, use:

- `@dhis2/app-runtime` for API calls.
- `@dhis2/ui` components where compatible.
- Existing theme/layout conventions.
- Existing router state.

Do not introduce a heavy UI framework unless already used.

### 9.2 Routing

Add Admin route(s), for example:

```text
/admin
/admin/overview
/admin/sync-activity
/admin/users
/admin/data-capture
/admin/logs
/admin/config
/admin/insights
```

If the app already has a layout/sidebar, integrate Admin UI into that structure without breaking existing routes.

### 9.3 Components

Create clean components:

```text
src/admin/AdminLayout.tsx
src/admin/AdminGuard.tsx
src/admin/pages/OverviewPage.tsx
src/admin/pages/SyncActivityPage.tsx
src/admin/pages/UsersPage.tsx
src/admin/pages/DataCapturePage.tsx
src/admin/pages/LogsPage.tsx
src/admin/pages/ConfigPage.tsx
src/admin/pages/InsightsPage.tsx
src/admin/components/HealthScoreCard.tsx
src/admin/components/RiskBadge.tsx
src/admin/components/ScopeSelector.tsx
src/admin/components/OrgUnitDrilldown.tsx
src/admin/components/InsightCard.tsx
src/admin/components/TelemetryChart.tsx
src/admin/components/SupportEvidenceImporter.tsx
src/admin/components/TroubleshootingBundleExport.tsx
```

Adjust paths to match the codebase conventions.

### 9.4 Services

Create services:

```text
src/services/adminConfigService.ts
src/services/telemetryService.ts
src/services/insightsEngine.ts
src/services/syncRiskScoring.ts
src/services/versionService.ts
src/services/supportEvidenceParser.ts
src/services/adminAuditService.ts
src/services/orgUnitScopeService.ts
```

### 9.5 State management

Use existing state management. If none exists, use a lightweight React context/hooks approach.

Required hooks:

```text
useAdminConfig()
useAdminScope()
useTelemetrySummary(scope, period)
useInsights(scope, period)
useAppVersionCheck()
useAdminAccess()
```

## 10. Intelligent Troubleshooting Rules

Implement a rules engine that produces findings from telemetry.

Example pseudo-logic:

```ts
if (trackerGetPerMinute > thresholds.trackerGetPerMinuteCritical) {
  addInsight({
    severity: 'critical',
    title: 'High tracker export volume',
    cause: 'Possible sync storm',
    evidence: [...],
    recommendation: 'Review facilities syncing now; ensure jitter and single-device lock are enabled.'
  });
}

if (percentMissingUpdatedAfter > 20) {
  addInsight({
    severity: 'high',
    title: 'Incremental sync not consistently used',
    cause: 'Some sync requests are behaving like full syncs',
    recommendation: 'Require updatedAfter for normal sync and restrict full sync to admin-controlled windows.'
  });
}

if (percentNestedEvents > 20 || percentFieldsAll > 20) {
  addInsight({
    severity: 'high',
    title: 'Expensive tracker export pattern detected',
    cause: 'Tracker export requests are too large',
    recommendation: 'Remove fields=* and fetch events separately.'
  });
}

if (asyncFalseBulkImports > thresholds.syncImportsCritical) {
  addInsight({
    severity: 'high',
    title: 'Synchronous tracker imports detected',
    cause: 'Tomcat request threads remain blocked during imports',
    recommendation: 'Use async=true for bulk imports and poll job status.'
  });
}
```

## 11. National-Level Analytics Requirements

The Admin UI must support national analysis without requiring raw patient-level data.

Required national indicators:

- Total active facilities today.
- Facilities syncing in last 15 minutes.
- Facilities with failed sync today.
- Facilities with no sync in last 24 hours.
- Facilities with high retry counts.
- Facilities with old app version sessions.
- National tracker GET/POST trend.
- National payload estimate trend.
- National sync success rate.
- National app version distribution.
- National top risk facilities.
- National top risk error categories.
- National recommended support actions.

Support drill-down by:

- Region.
- District.
- Facility.
- Program/register section where configured.
- User/device where authorised.

## 12. Evidence-Based Support Bundles

Implement “Export Troubleshooting Bundle” to help HISP Uganda and MOH support teams.

Bundle must include:

```text
appVersion
currentUser role/scope summary
selected org unit scope
selected time range
health score
insights list
sync summary
failed sync summary
request pattern flags summary
config summary excluding secrets
recent sanitized logs
support evidence imports metadata
browser/app environment
```

Export formats:

- JSON for technical review.
- CSV for tabular logs.
- Markdown summary for support tickets.

Do not export clinical payloads, tokens, cookies, or secrets.

## 13. Configuration Defaults

Start with safe defaults:

```json
{
  "maxTrackerPullPageSize": 25,
  "requireUpdatedAfterForNormalSync": true,
  "updatedAfterLookbackHours": 72,
  "allowFullSync": false,
  "fullSyncCooldownHours": 24,
  "syncJitterMinSeconds": 15,
  "syncJitterMaxSeconds": 180,
  "singleDeviceSyncLockEnabled": true,
  "multiTabSyncProtectionEnabled": true,
  "retryBackoffEnabled": true,
  "retryBaseDelaySeconds": 10,
  "retryMaxDelayMinutes": 30,
  "bulkImportAsyncEnabled": true,
  "maxDeleteBatchSize": 50,
  "maxConcurrentTrackerRequestsPerDevice": 2,
  "maxConcurrentTrackerRequestsPerFacility": 10,
  "trackerGetPerMinuteWarning": 50,
  "trackerGetPerMinuteCritical": 100,
  "trackerPostPerMinuteWarning": 30,
  "trackerPostPerMinuteCritical": 75,
  "slowRequestMsWarning": 5000,
  "slowRequestMsCritical": 10000,
  "payloadMbWarning": 100,
  "syncFailureRateWarning": 5,
  "facilityHotspotPercentage": 20,
  "appVersionDriftWarning": true,
  "staleJobAgeMinutes": 60
}
```

Make thresholds editable by authorised admins.

## 14. Testing Requirements

### 14.1 Unit tests

Add tests for:

- Health score calculation.
- Insight generation rules.
- Request pattern detection.
- Config validation.
- Support evidence parsing.
- Version check logic.
- Sync lock acquisition/release.
- Backoff calculation.
- Scope filtering.

### 14.2 Integration tests

Add tests for:

- Admin access guard.
- Data Store config read/write.
- Telemetry aggregation.
- Sync service behavior with optimized tracker requests.
- Async tracker import flow.
- Multi-tab sync coordination.

### 14.3 E2E tests with Playwright if available

Cover:

- Admin route hidden from normal user.
- National admin can open all Admin UI sections.
- Facility admin sees only assigned scope.
- Config changes update thresholds and audit log.
- Support evidence import generates Insights.
- Troubleshooting bundle export excludes sensitive data.
- Update banner appears when version changes.
- Existing data capture workflow still works.

## 15. Acceptance Criteria

Implementation is complete only when all criteria below pass:

1. Admin UI sections exist: Overview, Sync activity, Users, Data capture, Logs, Config, Insights.
2. Admin UI is role-protected and scope-filtered.
3. National overview supports drill-down from national to facility/user where authorised.
4. The app displays intelligent root cause insights, not only raw numbers.
5. The UI detects and flags expensive tracker request patterns.
6. The UI detects synchronous tracker import patterns.
7. The UI shows app version distribution and update status.
8. The app supports update propagation to already-open sessions.
9. Configurable thresholds are stored safely and audited.
10. Sync refactor prevents normal use of `fields=*,enrollments[*,events[*]]`.
11. Normal sync uses `updatedAfter` or a bounded safe lookback.
12. Normal page size is reduced to safe configurable values.
13. Bulk imports use `async=true` where applicable.
14. Multi-tab duplicate sync is prevented.
15. Jitter and backoff are implemented.
16. Logs and exports do not include clinical payloads or secrets.
17. Existing data capture workflows pass regression tests.
18. Build passes lint, typecheck, tests, and production build.
19. A developer implementation note is committed explaining architecture and future operations.
20. Deployment instructions are updated.

## 16. Implementation Plan for Claude

### Phase 0: Inspect and plan

1. Inspect project structure.
2. Identify framework and versions.
3. Identify current routing and permissions model.
4. Identify sync engine and API client.
5. Identify current local storage/IndexedDB usage.
6. Identify build/version/service worker behavior.
7. Produce a short implementation plan in `docs/admin-ui-troubleshooting-implementation-plan.md`.

### Phase 1: Foundation

1. Add Admin route shell and access guard.
2. Add config service and defaults.
3. Add telemetry service and event model.
4. Add audit service.
5. Add app version service.
6. Add sync risk scoring and insights engine.

### Phase 2: UI pages

1. Build Overview page.
2. Build Sync activity page.
3. Build Users page.
4. Build Data capture page.
5. Build Logs page.
6. Build Config page.
7. Build Insights page.

### Phase 3: Sync safety refactor

1. Refactor tracker exports.
2. Refactor tracker imports to async flow.
3. Add jitter.
4. Add sync lock.
5. Add backoff.
6. Add duplicate request prevention.

### Phase 4: Evidence import/export

1. Add support evidence importer.
2. Add troubleshooting bundle export.
3. Add sanitized CSV/JSON/Markdown export.

### Phase 5: Tests and hardening

1. Add unit tests.
2. Add integration tests.
3. Add E2E tests if test framework exists.
4. Run lint/typecheck/build/test.
5. Fix regressions.
6. Document deployment and use.

## 17. Files to Create or Update

Adjust based on actual codebase, but aim for:

```text
src/admin/**
src/services/adminConfigService.*
src/services/telemetryService.*
src/services/insightsEngine.*
src/services/syncRiskScoring.*
src/services/versionService.*
src/services/supportEvidenceParser.*
src/services/adminAuditService.*
src/services/orgUnitScopeService.*
src/sync/** existing sync engine files
src/routes/** existing routing files
src/App.*
src/manifest.webapp or d2.config.js if applicable
public/version.json or equivalent build metadata
docs/admin-ui-troubleshooting-implementation-plan.md
docs/admin-ui-operations-guide.md
docs/sync-safety-design.md
```

## 18. Documentation to Produce

Create or update:

```text
docs/admin-ui-operations-guide.md
docs/admin-ui-troubleshooting-implementation-plan.md
docs/sync-safety-design.md
docs/support-evidence-import-format.md
docs/deployment-and-update-propagation.md
```

The operations guide must explain:

- What each Admin UI section means.
- How national users interpret the health score.
- How to troubleshoot a sync storm.
- How to identify facility/user hotspots.
- How to safely export troubleshooting bundles.
- How app version update propagation works.
- What actions require developer changes versus DHIS2 admin action.

## 19. Final Validation Commands

Use the project’s actual package manager. Detect whether it uses npm, yarn, or pnpm.

Run the equivalent of:

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

If some scripts do not exist, document that clearly and run the nearest available equivalents.

## 20. Final Response Expected from Claude

At completion, provide:

1. Summary of implemented Admin UI sections.
2. Files changed.
3. Sync-safety changes made.
4. Tests run and results.
5. Known limitations.
6. Deployment notes.
7. Verification checklist for HISP Uganda/MOH users.

Do not claim implementation is complete unless the build and tests pass or you clearly document any blocker.
