import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/**
 * Opens an interactive Chromium window pointed at the dev server.
 *
 * Flow:
 *   1. Log in to the proxied DHIS2 instance through the UI.
 *   2. Make sure the eRegisters patients page has fully rendered.
 *   3. Either close the Chromium window OR press Ctrl-C in the terminal.
 *
 * Storage state is written to `e2e/.auth/state.json` whenever the
 * window or browser exits. The script prints "Saved auth state to …"
 * on success.
 */
async function main() {
    const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
    const out = path.resolve(__dirname, ".auth/state.json");
    fs.mkdirSync(path.dirname(out), { recursive: true });

    console.log(`[save-auth] launching Chromium, target ${baseURL}`);
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(baseURL);

    console.log(
        "\n--- LOG IN, REACH THE PATIENTS PAGE, THEN CLOSE THE CHROMIUM WINDOW ---",
    );
    console.log(`--- (saving to ${out}) ---\n`);

    const saveAndExit = async (reason: string) => {
        try {
            console.log(`[save-auth] saving state (${reason})…`);
            await ctx.storageState({ path: out });
            console.log(`[save-auth] Saved auth state to ${out}`);
        } catch (err) {
            console.error(`[save-auth] save failed:`, err);
        }
        try {
            await browser.close();
        } catch {
            /* ignore */
        }
        process.exit(0);
    };

    // `page.on('close')` fires while the context is still alive — perfect
    // moment to grab storage state.
    page.on("close", () => {
        void saveAndExit("page closed");
    });

    // Belt-and-braces for Ctrl-C.
    process.on("SIGINT", () => {
        void saveAndExit("SIGINT");
    });

    // If the browser dies before page.close (force kill), we can't read
    // storage state — log it.
    browser.on("disconnected", () => {
        console.log(
            "[save-auth] browser disconnected before save — state not captured",
        );
        process.exit(1);
    });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
