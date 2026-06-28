import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/**
 * Opens an interactive Chromium window pointed at the dev server.
 *
 * 1. Log in to the proxied DHIS2 instance through the UI.
 * 2. Once you can see the patients page, press Enter in the terminal.
 * 3. Storage state is saved to `e2e/.auth/state.json` and the flow
 *    tests reuse it without re-logging-in.
 *
 * Run with: `pnpm test:e2e:auth`
 */
async function main() {
    const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
    const out = path.resolve(__dirname, ".auth/state.json");
    fs.mkdirSync(path.dirname(out), { recursive: true });

    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(baseURL);

    console.log("\n--- LOG IN, REACH THE PATIENTS PAGE, THEN PRESS ENTER ---");
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    await new Promise<void>((resolve) => {
        process.stdin.once("data", () => resolve());
    });

    await ctx.storageState({ path: out });
    console.log(`\nSaved auth state to ${out}`);
    await browser.close();
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
