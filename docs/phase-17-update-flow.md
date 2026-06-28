# Phase 17 — In-App Update Flow (eRegisters)

Goal: when a new eRegisters bundle is installed in DHIS2, every already-
open browser session must stop running the old sync code and pick up
the new bundle without users clearing caches, reinstalling, or knowing
anything about deployment.

## Components

| File                                  | Purpose                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `src/version.ts`                      | Reads `DHIS2_APP_VERSION` / `DHIS2_APP_BUILD_HASH` / `DHIS2_APP_BUILD_TIME` at runtime. Fallbacks for dev. |
| `scripts/generate-version.js`         | Writes `public/version.json` from `package.json` + `git rev-parse`.     |
| `scripts/build.js`                    | `pnpm build` wrapper: regenerates `version.json` and exports the same `DHIS2_APP_BUILD_HASH` / `DHIS2_APP_BUILD_TIME` to the vite build so the bundled `BUILD_HASH` matches the JSON. |
| `src/update/updateChecker.ts`         | `startUpdatePolling`, `checkForAppUpdate`, `isUpdateAvailable`, `onUpdateAvailable`. Polls `version.json` every 5 min with `cache: "no-store"` and a `?t=` buster. |
| `src/update/safeRefresh.ts`           | `startSafeRefreshFlow`: detects unsaved data, saves drafts if possible, cleans only **app-shell** caches (clinical/offline caches preserved), calls `skipWaiting` on a waiting service worker, then reloads. |
| `src/update/syncGuard.ts`             | `isSyncBlockedByUpdate`, `withUpdateGuard`. Gates every heavy sync entry point. |
| `src/update/useUpdateWatcher.tsx`     | Mounted once in `App.tsx`; wires the poller + safe refresh into the antd `App` notification surface. |
| `src/components/support-info.tsx`     | Visible footer showing version + build + a "download diagnostics" button. |

## What changes for users

* The app loads exactly as today — no extra blocking step.
* Background sync only fires inside the facility's scheduled slot.
* Every 5 minutes the app quietly polls `version.json`.
* When a new deployment is detected, an antd info message announces the
  refresh and the page reloads after ~250 ms (long enough to render
  the message). If a form is dirty (`window.__eregistersUnsaved`), the
  app shows a blocking modal asking the user to save first.

## Where the sync guard fires

* `src/machines/sync.ts` `pullData` actor — returns immediately if an
  update is pending. Tab will not start a new heavy pull.
* `src/machines/sync.ts` `processBatchSync` actor — returns
  `{ processed: 0, succeeded: 0, failed: 0 }`. The push queue holds
  pending records locally; they will be pushed by the new bundle.

Both actors remain intact for non-update operation; the guard is a
single `if (isSyncBlockedByUpdate())` at the top.

## Cache handling

`safeRefresh.cleanAppShellCaches`:
* Deletes only app-shell / static-asset caches.
* Preserves any cache whose name matches `clinical`, `offline-data`,
  `tracker-data`, `indexed`, `section-*`, `recording-*`.

`safeRefresh.activatePendingServiceWorker`:
* Sends `{ type: "SKIP_WAITING" }` to the waiting SW (matching the
  message contract used by `@dhis2/pwa` and standard Workbox builds).
* No-op if no SW is registered or no SW is waiting.

**IndexedDB is never touched** by the update flow.

## Cache-Control recommendations for deployment

Configure the upstream proxy / DHIS2 so:

| Asset                              | Cache-Control                       |
| ---------------------------------- | ----------------------------------- |
| `version.json`                     | `no-store`                          |
| `index.html`                       | `no-cache` (or short max-age)       |
| `manifest.webapp`                  | `no-cache`                          |
| `d2.config.json`                   | `no-cache`                          |
| Unhashed JS/CSS                    | `no-cache`                          |
| Hashed `assets/*-<hash>.js/.css`   | `max-age=31536000, immutable`       |
| `data/villages.min.json`           | Versioned URL or strong validators  |

The Vite build already emits hashed asset names (`App-<hash>.js`,
`main-<hash>.js`), so the last row is already correct.

## Deployment validation playbook

1. Open the eRegisters app in browser A. Note the version in the
   footer (e.g. `v1.1.4 · build bfa6997`).
2. Build & install a new version in DHIS2 (e.g. `1.1.5`).
3. Keep browser A open.
4. Within 5–15 minutes browser A receives an info banner:
   *"A new eRegisters version has been installed. The app will refresh
   to apply important updates. Your saved local data will not be lost."*
5. Browser A reloads automatically.
6. After reload, the footer shows the new version + build hash.
7. Confirm IndexedDB is unchanged (open DevTools → Application →
   IndexedDB → `MOHRegisterDB` etc).
8. Confirm tracker traffic from this client now uses the new pattern.

If unsaved data is present at step 4, the modal blocks until the user
saves; browser A will not reload before that.

## Diagnostics

The support footer button writes a JSON blob containing:

```json
{
  "generatedAt": "...",
  "appVersion": "1.1.4",
  "buildHash": "bfa6997",
  "buildTime": "...",
  "records": [ { syncId, mode, ... }, ... ]
}
```

These are the last 20 sync events recorded by `SyncTelemetryBuilder`
(`pages`, `trackedEntitiesPulled`, `eventsPulled`, `failures` etc.).

## How to ship a new version

1. Bump `package.json` → `version`.
2. `pnpm install` (lockfile may not need changes).
3. `pnpm build` (the wrapper regenerates `public/version.json`).
4. Upload `build/bundle/eregisters-<version>.zip` via DHIS2 App
   Management.
5. Watch the access logs for the post-deployment patterns documented
   in `docs/deployment-sync-performance-fix.md`.

**Never** redeploy a new bundle without bumping the version or the
build hash — clients will not detect the update.
