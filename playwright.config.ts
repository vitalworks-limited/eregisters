import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright is used for browser smoke + flow tests against the locally
 * running dev server (d2-app-scripts start, port 3000).
 *
 * Auth: real flows need a DHIS2 session. Run `pnpm test:e2e:auth` once
 * to log in interactively and save state to `e2e/.auth/state.json`,
 * which the flow tests then reuse.
 */
export default defineConfig({
    testDir: "./e2e",
    timeout: 60_000,
    expect: { timeout: 10_000 },
    fullyParallel: false,
    workers: 1,
    reporter: [["list"]],
    use: {
        baseURL: "http://localhost:3000",
        trace: "retain-on-failure",
        viewport: { width: 1366, height: 900 },
    },
    projects: [
        {
            name: "smoke",
            testMatch: /.*\.smoke\.spec\.ts/,
            use: { ...devices["Desktop Chrome"] },
        },
        {
            name: "flows",
            testMatch: /.*\.flows\.spec\.ts/,
            use: {
                ...devices["Desktop Chrome"],
                storageState: "e2e/.auth/state.json",
            },
        },
    ],
});
