# eRegisters Android App — Comprehensive Development Plan

Status: Draft — for team review
Audience: Engineering, product, ops
Companion to: the existing web app at this repo's root

---

## 1. Executive Summary

We will build a native Android client of eRegisters for clinicians in the field. It implements the full clinical workflow of the web app (search, register, record visits, sync) with mobile-first UX, true offline-first behavior, and unified administration with the web client via the existing DHIS2 dataStore controls.

The recommended path is **native Kotlin + Jetpack Compose, built on the DHIS2 Android SDK**, with explicit custom layers where the SDK does not fit eRegisters' workflow (notably search, drafts, sync orchestration, and program-rule regression testing). Distribution is multi-channel (Google Play, GitHub Releases, optionally DHIS2 App Hub). Admin features are out of scope for v1; admins continue to use the web app.

Target time to GA: **~5.5 months** with two senior Android engineers, a part-time designer, and a part-time QA.

---

## 2. Context & Goals

The web app at this repo is a DHIS2 SPA shipped via the DHIS2 app shell. It supports:

- Search-first patient discovery (multi-word, AND across words, OR across attributes — both offline and online).
- Patient registration with draft autosave.
- Patient detail with three tabs: Overview, Demographic Details, Visits.
- Visit recording — a main event plus child events for program stages (medicines, vaccinations, etc.).
- Program-rule-driven validations and field visibility.
- Custom sync state machine (XState) handling push (tracker import), pull (incremental + full), deletes, kill switch, allowed/blocked sync windows, and telemetry.
- An admin update broadcast that triggers a safe-refresh flow on connected clients.
- Per-facility deployment via DHIS2 dataStore-driven configuration.

Goals for the Android app:

1. **Workflow fidelity** with the web app. Clinicians should not need re-training when moving from web to phone.
2. **True offline-first**. Long offline periods (days/weeks) are normal. Sync is opportunistic.
3. **Mobile-native UX**. Thumb-reachable controls, one-column forms, large targets, dark mode, accessibility.
4. **Unified administration**. The same dataStore keys (`kill-switch`, `sync-config`, `broadcast`) govern both clients. Admins write once.
5. **Per-facility deployability**. Same DHIS2 server, same OUs, same programs — no separate backend.

Out of scope for v1:

- Admin features (publish broadcasts, view dashboards, manage users, view sync queue, etc.). Admins use the web app.
- PDF dashboard rendering (web-only Phase-5 candidate).
- Languages other than English (string-resourced from day one so adding locales later is mechanical).

---

## 3. Confirmed Constraints

| Constraint | Decision |
|---|---|
| Minimum Android version | **API 23 (Android 6.0 Marshmallow)** — the floor of the DHIS2 Android SDK (`minSdkVersion = 23` per its `libs.versions.toml` on `main`). |
| Target SDK | Latest stable at time of build (currently API 34 / Android 14). |
| Distribution | **Multi-channel**: Google Play (primary), GitHub Releases (mirror + self-managed deployments), optionally DHIS2 App Hub for discoverability. |
| Admin features | **Out of scope** for v1. App is for clinicians only. |
| Localisation | **English only** for v1. String resources from day one. |

Open: hardware target list for low-end perf testing, DHIS2 server version, team composition.

---

## 4. Platform Decision

Four options were evaluated:

| Path | Code reuse | Offline plumbing | UX feel | Effort | Risk |
|---|---|---|---|---|---|
| **A. Native Kotlin + DHIS2 Android SDK** (chosen) | UX patterns only | Mostly free (SDK) | Native Material 3 | High | Low–Med |
| B. Native Kotlin, no SDK (direct REST + Room) | UX patterns only | DIY (rebuild ~16 weeks of plumbing) | Native Material 3 | Very high | Med |
| C. Capacitor wrap of existing PWA | ~100% | PWA-only | Web feel in shell | Low | Med (poor offline UX, no native integrations) |
| D. TWA / installable PWA | 100% | PWA-only | Browser-based | Lowest | Fails the "fully native mobile" bar |

**Chosen: A**, with eyes open about which SDK pieces we'll wrap or replace (see Section 8).

The SDK saves us from rebuilding ~3–4 months of unsexy plumbing (metadata sync, tracker-import job polling, conflict detection, multi-user auth, encrypted local DB, dataStore primitives). It does *not* save us from building forms, custom search semantics, program-rule regression testing, or the sync orchestration layer above it. We accept ~6 weeks of "adapter work" in exchange for those ~3–4 months of savings.

Path **C** is acceptable only as a short bridging strategy (6–8 weeks to deployable) while Path A is built. It is not the final destination. Note that a `docs/capacitor-migration-plan.md` already exists in this repo; if a bridge is needed it can be activated independently.

---

## 5. Architecture

```
+----------------------------------------------------------+
|  UI Layer (Compose)                                      |
|   Screens + ViewModels                                   |
|   - PatientSearchScreen, PatientDetailScreen,            |
|     RegistrationWizard, VisitFormScreen, SyncIssues, ... |
|   StateFlow -> Compose state                             |
+--------------------+-------------------------------------+
                     | Use cases (suspend funs)
+--------------------v-------------------------------------+
|  Domain Layer                                            |
|   - SearchPatients, RegisterPatient, RecordVisit,        |
|     PushData, PullData, EvaluateProgramRules,            |
|     ConsumeAdminConfig, ApplyForcedUpdate                |
+--------------------+-------------------------------------+
                     | Repositories (Kotlin interfaces)
+--------------------v-------------------------------------+
|  Data Layer                                              |
|   - SDK wrappers: AuthRepository, MetadataRepository,    |
|     PatientRepository, EventRepository, DataStoreRepo    |
|   - Custom Room tables: DraftPatient, SearchIndex,       |
|     LocalParentChildLink (if needed), Telemetry          |
|   - WorkManager job definitions: SyncWorker,             |
|     MetadataRefreshWorker, BroadcastPollWorker           |
+----------------------------------------------------------+
```

Pattern: **MVVM** with a thin domain layer of `UseCase`s so screens stay unit-testable. Single-activity, multi-screen Compose Navigation.

Module layout (Gradle):

```
:app                      Compose UI + ViewModels + DI graph
:core:design              Theme, Material 3 tokens, shared Composables
:core:domain              Pure-Kotlin use cases + domain models
:core:data                Repositories, SDK wrappers, Room stores
:core:sync                SyncCoordinator + WorkManager workers
:core:rules               Program-rule engine wrapper + regression harness
:feature:auth             Login, session, biometric unlock
:feature:patients         Search, detail, registration
:feature:visits           Main event + program stage capture
:feature:settings         Sync controls, profile, about
```

---

## 6. Tech Stack

| Concern | Choice | Rationale |
|---|---|---|
| Language | Kotlin (2.2.x) | Standard; ergonomic with Compose and coroutines |
| UI toolkit | Jetpack Compose + Material 3 | Modern declarative UI; Material You dynamic theming |
| DI | Hilt | Convention in Compose projects |
| Async | Coroutines + Flow | Native fit with SDK Flows and Compose state |
| Local DB | SDK-internal SQLite + custom Room for non-SDK tables | Encrypted via SDK option (SQLCipher) |
| Background work | WorkManager | Survives reboots; respects Doze; battery-aware |
| Navigation | Compose Type-safe Navigation | Modern, single-activity |
| Form rendering | Custom Composables driven by program metadata | Mirrors web's `DataElementRenderer` |
| Crash + perf | Sentry or Firebase Crashlytics | Pick one — prefer Sentry if cross-platform parity with web matters |
| Build | Gradle + Version Catalogs | Standard |
| CI | GitHub Actions | Aligns with existing workflow |
| Linting | Ktlint + Detekt | Standard |
| Static analysis | Android Lint + custom rules | Catch obvious regressions |

---

## 7. Feature Parity Mapping

| Web feature | Source on web | Android counterpart |
|---|---|---|
| Login | DHIS2 app shell | `d2.userModule().login(...)` (SDK) + biometric unlock layer |
| Patient search (offline + online lookup) | `tracked-entities.index.tsx`, `useOnlineSearchCount` | Custom Room FTS index over SDK-owned TEs (multi-word AND/OR semantics) + per-word SDK online lookups intersected locally |
| Search-first inline registration | `feat/search-first-patients` work | `PatientSearchScreen` → `RegistrationWizard` (multi-step) |
| Patient detail (Overview / Demographic / Visits) | `tracked-entity.tsx` | `PatientDetailScreen` with Material tabs in same order |
| Visit recording (main + stages) | `main-event-capture.tsx`, `program-stage-capture.tsx` | `VisitFormScreen` driven by program-stage metadata |
| Draft persistence | `__eregistersUnsaved` + `__eregistersSaveDraft` | Dedicated Room `DraftPatient` table separate from SDK store |
| Program rules | `EventContext` / `TrackedEntityContext` | `d2.programModule().programRuleEngine()` + regression test corpus |
| Sync state machine | `machines/sync.ts` (XState) | `SyncCoordinator` + WorkManager (no FSM needed — SDK exposes coarse states) |
| Sync push (tracker import) | `submitTrackerImportAndAwaitReport` | `trackerD2Progress.upload()` (SDK), wrapped for telemetry |
| Sync pull (incremental + full) | `pullEventsIncremental`, `pullTrackedEntitiesIncremental` | SDK downloaders with built-in cursors |
| Deletes (cascade) | `deleteEventWithChildren` | SDK single-entity delete + cascade in Kotlin |
| Kill switch / sync windows | `isSyncAllowedByAdmin` | Same dataStore keys via SDK `dataStoreModule()`, guard inside `SyncCoordinator` |
| Admin update broadcast (consumer side) | `useUpdateWatcher` → `safeRefreshFlow` | Poll same `broadcast` key; trigger Play In-App Update or APK self-update depending on install source |
| Sync telemetry | `SyncTelemetryBuilder` writes to dataStore | Port writer 1:1 — same keys, unified web+Android telemetry |
| Conflict resolution | sync status badges, no dedicated screen | New "Sync issues" screen reading SDK `ERROR`-state entities |
| PDF dashboards | admin/pdf | Out of scope for v1 |
| Admin features (broadcast publisher, dashboards, users, queue, logs) | `admin.*` routes | Out of scope; admins use web |

---

## 8. SDK Fit Analysis

Each major workflow scored as one of:

- **[FIT]** — SDK fits cleanly, minimal adaptation
- **[WRAP]** — SDK provides primitives; build a thin layer on top
- **[REPLACE]** — SDK doesn't fit; build parallel implementation

| # | Workflow | Verdict | Cost | Notes |
|---|---|---|---|---|
| 1 | Patient search | [REPLACE] | 3–5 d | SDK's `byQuery(string)` does not implement AND-across-words / OR-across-attrs. Build a Room FTS4/FTS5 index updated via SDK Flows. |
| 2 | Registration + drafts | [WRAP] | 1 wk | SDK has no "draft" concept; keep drafts in a separate Room table until final submit. Cleaner than the web pattern. |
| 3 | Patient detail | [FIT] | 3 d | Combine TE + enrollment + events flows in a ViewModel; project to a flattened UI state. |
| 4 | Visit recording | [WRAP] | 1–2 wk | `parentEvent` resolved (Appendix A): it's a dataValue (DE `Wx7x4sMAa62`). SDK handles natively; no parallel storage needed. |
| 5 | Program rules | [WRAP + test] | 1 wk | Use SDK engine; **mandatory** regression-test corpus against the web's `EventContext`/`TrackedEntityContext` behavior. Biggest behavior risk. |
| 6 | Sync push | [FIT] | 3–4 d | SDK handles tracker-import job polling end-to-end. Big plumbing win. |
| 7 | Sync pull (data + metadata) | [FIT] | 1–2 d | Discard custom incremental cursors; use SDK downloaders. |
| 8 | Sync orchestration | [WRAP] | 1 wk | Replace XState machine with `SyncCoordinator` + WorkManager. Adapt admin guards + telemetry. |
| 9 | Admin config (kill switch, windows, broadcast) | [FIT] | 1 d | SDK `dataStoreModule()` + small polling/cache wrapper. Same dataStore keys as web. |
| 10 | Update broadcast → forced update | [WRAP] | 3 d | Detection via SDK dataStore; action via Play In-App Updates API or APK self-update depending on install source. |
| 11 | Conflict resolution UX | [FIT + new screen] | 3 d | SDK exposes `ERROR`-state entities; build a "Sync issues" screen for resolution. |
| 12 | Reactive observability | [FIT] | 0 | SDK exposes Kotlin Flow on every module. Direct fit with Compose. |
| 13 | Testing | [WRAP] | 1 wk setup | Domain layer with fakes; SDK-touching code via containerized DHIS2 in CI. |
| 14 | Initial pull performance | [WRAP — UX-only] | 3 d | Known SDK weakness on low-end devices with metadata-heavy programs. UX with progress; optionally pre-seed snapshot in APK. |
| 15 | Telemetry to dataStore | [FIT] | 1 d | Port web's writer 1:1. Unified telemetry. |

**Tally:**

- [FIT]: six areas, ~14 days
- [WRAP]: seven areas, ~6 weeks
- [REPLACE]: one area (search), ~1 week

**Net SDK-adaptation work: ~9 weeks**, spread across the development phases. Counterfactual (no SDK): ~16 additional weeks to reach the same baseline.

### Honest weaknesses to plan around

1. **Opinionated data model** — SDK enforces normalized DHIS2 tracker schema. Your `FlattenedTrackedEntity`/`FlattenedEvent` shapes are produced by adapter functions in ViewModels.
2. **Search semantics are server-style** — re-implementing multi-word semantics is unavoidable (see #1 in scorecard).
3. **No form UI** — SDK gives metadata + values, never widgets. ~25–30% of your Phases 2–3 budget is forms.
4. **Program-rule engine divergence** — independently implemented from your web rule machine. Treat the regression-test corpus as a release blocker, not a nice-to-have.
5. **Async tracker import via job tracker** — SDK handles it, but partial failures still surface; conflict UX is your responsibility.
6. **Initial pull performance** — known weakness on low-end devices.
7. **Version lag** — SDK trails DHIS2 server features by weeks-to-months. Pin SDK version against your specific server version.
8. **Black-box local schema** — you can't add indexes or columns to SDK tables; that's why search lives in a separate Room FTS.
9. **Mocking friction in tests** — push business logic into pure-Kotlin use cases; keep SDK calls behind narrow repository interfaces.
10. **Lock-in** — extracting years of stored patient data later is painful. The dataStore-driven admin layer mitigates by being SDK-agnostic.

---

## 9. Offline-First Design

| Scenario | Behavior |
|---|---|
| First launch, online | Metadata download (programs, stages, attributes, option sets, program rules). Progress screen. Skip on subsequent launches except periodic refresh. |
| First launch, offline | Blocked — needs initial metadata pull. Clear "Connect to install" screen. |
| Normal use, online | Every write goes to local storage first; queued for upload. WorkManager pushes in the background. User never waits on the network. |
| Normal use, offline | Identical write path. Sync indicator shows "X pending". |
| Reconnect | WorkManager fires on network-available constraint; pushes pending then pulls incremental. |
| Conflict on push | SDK marks the record `ERROR`. Sync-issues screen surfaces resolution UI. |
| Storage low | Warning at 80% full. SDK supports metadata compaction; admin can flag for re-sync. |
| Long offline (weeks) | Fully supported. Periodic background sync wakes up on reconnect. |
| Device suspended (Doze) | WorkManager handles deferred execution. Force-update broadcasts caught on next foreground. |

**Storage encryption**: enabled via SDK option (`D2Configuration.encrypted = true`). Keys live in Android KeyStore. Performance impact accepted.

**Persistent storage**: handled by SDK (DB not stored in cache directory).

---

## 10. Sync Strategy

`SyncCoordinator` (suspend functions) orchestrates the work. WorkManager schedules it.

```
Periodic worker (every 1h, network constraint, battery OK)
  -> Check admin kill switch        (bail if disabled)
  -> Check allowed window           (bail if outside window)
  -> Push pending tracker imports   (SDK upload)
  -> Pull incremental since last    (SDK downloaders)
  -> Update search index from delta (Room FTS write)
  -> Append telemetry row to        (dataStore writer)
     the same dataStore keys used
     by the web client

Connectivity-triggered worker
  -> Same as above; fires seconds after reconnect

Manual sync (user pull-to-refresh / "Sync now" in Settings)
  -> Foreground service for visibility
  -> Same payload, marked manual in telemetry

Boot-completed receiver
  -> Re-schedule periodic worker (WorkManager handles persistence,
     belt-and-braces for OEM behaviors)
```

Mirror the web's existing admin controls by **reading the same dataStore keys**:

- `kill-switch` — disables sync entirely.
- `sync-config` — defines allowed/blocked time windows.
- `broadcast` — admin force-update notice.

Admins continue to use the web app's existing UI to write these. Android only consumes.

Telemetry: each sync attempt appends a record to the same dataStore key the web app already writes. Ops sees a unified view of all clients.

---

## 11. UI/UX Design

### Navigation skeleton

Bottom nav with four destinations:

- **Home** — Today's queue / quick search shortcut
- **Patients** — Search-first patient list, FAB to register
- **My Visits** — Drafts + recent visits, sync-pending badge
- **Settings** — Sync controls, profile, about, sign out

Top app bar shows: facility name (current OU) + connectivity dot + sync-pending count.

### Key screen patterns

| Screen | Pattern |
|---|---|
| Patient search | Pinned search bar; multi-word semantics; results as cards (avatar, name, age, sex, NIN tail). Tap → detail. FAB "Register" (enabled only after a search attempt — matches web's search-first rule). |
| Patient detail | Material 3 large top app bar collapsing to small; horizontal tabs Overview / Demographic Details / Visits — same order, same names as web. Each tab a `LazyColumn`. |
| Registration | **Multi-step wizard** (3–5 steps), one card of fields per step. Progress dots. Each step autosaves the draft (Room) so accidental dismissal is non-fatal. |
| Visit recording | Same wizard approach. Main event first, then program stages, then summary. Required fields gate the bottom-sticky "Continue" button. |
| Sync issues | List of `ERROR`-state records; tap to view conflict + resolve. |
| Empty states | Big illustration + clear primary action. Same tone as web. |

### Touch and accessibility rules

- All interactive targets ≥ 48dp.
- One-column form layout; never side-by-side fields under 600dp width.
- Keyboard handling: `imePadding`, correct `keyboardOptions` per field type, Next/Done IME actions.
- Material You dynamic color on Android 12+. Fallback brand palette below.
- Dark theme parity.
- TalkBack labels on every interactive node.
- Localised string resources from day one (English only loaded for v1).

### Forms driven by program metadata

Same idea as web's `DataElementRenderer`: one `@Composable` per DHIS2 `valueType` (TEXT, NUMBER, INTEGER, DATE, BOOLEAN, OPTION_SET, COORDINATE, FILE_RESOURCE...). A registry maps type → composable. Adding a new field at the program level requires no app code change.

### Workflow preservation

- **Search-first registration**: FAB "Register" only enabled after a search has run (matches web).
- **Visit recording**: occurredAt defaults to today; pulls forward from main event same as web.
- **Sync status badges**: same color semantics across both platforms (synced / draft / queued / error / deleted).
- **Tab labels**: Overview, Demographic Details, Visits — same as web (after the recent rename).

---

## 12. Security

| Control | Implementation |
|---|---|
| Auth | DHIS2 SDK `userModule().login(...)` |
| Local DB encryption | SDK SQLCipher option enabled |
| Token storage | Android KeyStore (not SharedPreferences) |
| Biometric unlock | Android Biometric API |
| PIN fallback | For shared / shift-worker devices |
| Auto-lock | 5 min idle default (configurable) |
| Wipe on max failed PIN attempts | 10 default (configurable) |
| Screen flag | FLAG_SECURE on patient detail — confirm with clinical team before enabling |
| Cert pinning | Optional; only if DHIS2 server has stable cert. Trades flexibility for hardening. |
| Forced sign-out via admin | Read kill-switch flag; on next online sync, log out + wipe |

---

## 13. Testing Strategy

| Layer | Tools | Notes |
|---|---|---|
| Unit (pure logic) | JUnit5 + MockK + Turbine | Domain layer use cases, mappers, validators |
| ViewModel | Coroutines test + Turbine | StateFlow assertions on UI state transitions |
| Repository (SDK-touching) | Robolectric + containerised DHIS2 in CI | Tests run against a real test server |
| **Program rule regression** | Custom harness | Replay real program rules against fixture inputs; assert effects match web's `EventContext` outputs. **Release-blocker** for any divergence. |
| UI screen | Compose UI test (in-process) | Per-screen interaction tests |
| E2E | Maestro flows | Three golden paths: login → search → register → visit → sync |
| Manual offline matrix | Scripted | Airplane-mode register → reconnect → server-side assertion. Run before each release. |
| Device matrix | Firebase Test Lab | Low-end Android 7, mid-range Android 11, latest Android 14 |

CI gate (must pass for PR merge):

- Ktlint + Detekt
- Unit tests
- Robolectric tests
- Maestro smoke (one golden path)

Nightly:

- Full Maestro suite on Firebase Test Lab
- Program rule regression harness

---

## 14. Distribution & Release

Three concurrent channels, single source of truth:

| Channel | Audience | Update mechanism |
|---|---|---|
| **Google Play** | Public-facing / regulated facilities | Play Store updates + In-App Updates API for forced rollouts |
| **GitHub Releases** | Self-managed deployments, IT teams blocking Play, CI artefacts | Versioned signed APK + AAB; in-app self-update flow that reads a `latestApk` dataStore key and walks the user through APK install |
| **DHIS2 App Hub** | DHIS2 community discoverability | Listed APK pointing at GitHub Release asset |

**Build pipeline** (GitHub Actions, single workflow per tag):

1. Tag `vX.Y.Z` triggers the workflow.
2. Build signed AAB + APK.
3. Upload AAB to Play (internal track first; promotion gates manual).
4. Create GitHub Release with APK + AAB + signed `version.json` (mirrors the web's version artifact).
5. (Optional) Submit listing update to DHIS2 App Hub.

**Force-update flow**:

- Admin writes `severity: "forced"` + target `buildHash` to the existing `broadcast` dataStore key via the web app.
- Android client polls the key (same cache pattern as the web's `adminConfigCache`).
- On detection:
  - If installed from Play → Play In-App Updates API triggers an in-app immediate update.
  - If installed via APK → open the GitHub Release URL and walk the user through APK install.
- Same admin UI; two terminal actions chosen by install source.

Versioning mirrors the web app — `appVersion` + `buildHash` go into telemetry so a unified dashboard shows what's deployed across both platforms.

---

## 15. Phased Delivery Plan

| Phase | Outcome | Duration |
|---|---|---|
| **0. Spike & scaffold** | Compose app talking to your DHIS2 server, SDK login working, one screen reading metadata. Build pipeline (Play internal + GitHub release on tag) + Crashlytics/Sentry in place. Repo layout finalised. | 2 wks |
| **1. Read-only patient flows** | Login + patient search (online & offline, multi-word) + patient detail (Overview/Demographic read-only). Custom Room FTS search index. Internal hands-on review with clinicians for look & feel. | 4 wks |
| **2. Registration + edit** | Demographic tab with edit, registration wizard, draft autosave, validation parity with web. Form composable library covering all valueTypes used. | 4 wks |
| **3. Visits** | Main event + program stages, parent/child link, program-rule engine integration. Program-rule regression test corpus stood up in CI. Field-test phase with 1–2 facilities. | 5 wks |
| **4. Sync + admin-driven controls** | WorkManager periodic + reconnect-triggered. Kill switch + windows + broadcast force-update via Play In-App Updates / APK self-update. Conflict UX (Sync Issues screen). Telemetry to existing dataStore. | 2 wks |
| **5. Polish + accessibility** | Low-end device perf pass, dark theme audit, TalkBack audit, onboarding UX. Localisation scaffolding (English only loaded). | 2 wks |
| **6. Pilot → rollout** | 1–2 facilities first; widen on stable metrics. Performance dashboards. | Ongoing |

**Total to GA: ~5.5 months** with 2 senior Android engineers + part-time designer + part-time QA. Usable internal builds at the end of Phase 1.

Dependencies between phases:

- Phase 0 unblocks everything.
- Phase 1 can start anytime after Phase 0 is even partly stable.
- Phase 2 depends on the form-composable library which is part of Phase 2 itself — start with the simplest valueTypes first.
- Phase 3 design is unblocked — `parentEvent` semantics resolved (Appendix A): dataValue `Wx7x4sMAa62`, SDK handles natively.
- Phase 4 depends on Phase 3 (sync only makes sense when there's something to sync).
- Phase 5 can run partly in parallel with Phase 4.

---

## 16. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Program-rule engine divergence from web | High | Mandatory regression-test corpus, release-blocker on any divergence. Allocated 1 week in Phase 3. |
| `parentEvent` semantics | Resolved | DataValue `Wx7x4sMAa62` (see Appendix A). No special architecture needed. |
| DHIS2 SDK version doesn't match server | Med | Pin SDK version tested against the specific DHIS2 server. Upgrade in a dedicated sprint when server upgrades. |
| Low-end field devices (1–2 GB RAM, 8 GB storage) | Med | Profile early. Set storage warning at 80% full. Metadata pruning if needed. |
| Long-offline → giant push payload | Med | SDK chunks tracker imports. WorkManager retries with backoff. Foreground service for very large pushes. |
| Initial pull performance on heavy metadata | Med | UX with progress. Optional: pre-seed metadata snapshot for centrally imaged devices. |
| Lost devices / staff turnover | Med | Biometric + PIN + auto-lock. Admin kill-switch flag picked up on next online sync. |
| Update distribution outside Play Store | Low | Existing dataStore-driven update banner works the same on Android — no extra infra. Forced installs need MDM. |
| Sync conflicts with multi-clinician edits on same patient | Med | Mirror web's "server-wins for demographics, error-out for clinical edits". Surface conflicts in the dedicated Sync Issues screen. |
| Field training / change management | Out of eng scope | Flag for the program team early. |
| Android skills shortage on team | Variable | If team has no Android experience, ramp 2–3 weeks or bring in a contractor for Phases 0–1. |

---

## 17. Open Questions

To be resolved before Phase 0 kickoff:

1. **Existing Android skills on the team?** If none, factor 2–3 week ramp or hire a contractor for Phases 0–1.
2. **Hardware target for low-end perf testing.** Give 1–2 sample device models actually in field deployments. Pin them in Firebase Test Lab.
3. **DHIS2 server version being targeted.** Pins the exact SDK release to use.
4. **Timing constraints.** Is ~5.5 months to GA acceptable, or is there a clinical deadline pulling it forward (and do we then bridge with Path C / Capacitor)?
5. **Crash/perf reporting choice** (Sentry vs Crashlytics). Sentry recommended for parity with web telemetry if web uses it.
6. **Cert pinning** — yes/no based on DHIS2 server cert stability.
7. **FLAG_SECURE on patient detail** — confirm with clinical team (sometimes blocks legitimate support workflows).

---

## Appendix A — `parentEvent` Investigation (resolved)

**Result: Case (a) — custom data element `Wx7x4sMAa62` holds the parent event UID. The SDK handles it identically to any other dataValue. No special work needed.**

Trace (verified in this repo):

- `src/schemas.ts:302` — `FlattenedEvent.parentEvent: UID.optional()`. Local-only column on the flattened shape.
- `src/db/transformers.ts:76–80` — On the **outbound** path, `transformEvent` injects the value back into `dataValues` under data element UID `Wx7x4sMAa62` before the row goes to DHIS2 via tracker import:
  ```ts
  if (event.parentEvent) {
      finalDataValues = {
          ...finalDataValues,
          Wx7x4sMAa62: event.parentEvent,
      };
  }
  ```
- `src/utils/utils.ts:79` — On the **inbound** path, `flattenEvent` reads `eventAttrs["Wx7x4sMAa62"]` and projects it onto the `parentEvent` column for ergonomic local querying.

So `parentEvent` is a DHIS2-side dataValue (data element `Wx7x4sMAa62`) and a local convenience column. The SDK persists it like any other dataValue.

**Implications for the Android architecture:**

- No new relationship type to model.
- No parallel Room linkage table.
- Reading children: SDK event query filtered by `dataValues["Wx7x4sMAa62"] == parentUid`. If filter-by-dataValue at the SDK API is awkward, observe the event Flow and project a small in-memory parent-children map in the ViewModel.
- Writing children: just set the dataValue at submit time, same as web's `transformEvent`.
- Cascade delete: identical to web — find children by the same dataValue filter, delete each, delete parent.

**Action items for Phase 0:**

1. Add a constant `PARENT_EVENT_DE_UID = "Wx7x4sMAa62"` to `:core:data`. Single source of truth; same value as web.
2. Add a small helper `EventRepository.observeChildren(parentUid): Flow<List<Event>>` that filters on the dataValue.
3. Mirror `deleteEventWithChildren` as a Kotlin coroutine: enumerate by dataValue, then SDK-delete each + the parent.

No architectural unknowns remain for visit recording. Phase 3 can proceed against a stable design.

---

## Appendix B — Glossary

| Term | Meaning |
|---|---|
| TE / TEI | Tracked Entity (Instance) — a patient record in DHIS2 |
| TEA | Tracked Entity Attribute — a field on a patient (e.g., name, NIN, phone) |
| Event | A clinical interaction (visit, vaccination, measurement) |
| Program Stage | A type of event within a program (e.g., "Antenatal visit", "Immunisation") |
| dataStore | DHIS2's REST-accessible key-value store, used here for admin config + broadcast + telemetry |
| Tracker Import | DHIS2's bulk-upload API for TEs + enrollments + events, with a job-tracker poll for completion |
| FTS | Full-text search (SQLite extension); used here for the Android-side search index |
| WorkManager | Android Jetpack library for deferrable, guaranteed background work |
| In-App Updates API | Google Play API that lets an app trigger its own update flow in foreground |
