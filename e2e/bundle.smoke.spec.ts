import { expect, test } from "@playwright/test";

/**
 * Unauthenticated smoke check. d2-app-shell renders its sign-in screen
 * when there's no DHIS2 session, so we verify the shell loaded, no
 * console errors fired, and the login form is visible. Anything past
 * this point requires an authenticated session — see admin.flows.spec.ts.
 */
test("dev server boots into the DHIS2 sign-in screen", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => {
        errors.push(`pageerror: ${err.message}`);
    });

    await page.goto("/", { waitUntil: "networkidle" });

    // d2-app-shell pulls in `Please sign in` headline + form fields.
    await expect(page.getByText(/Please sign in/i)).toBeVisible();
    await expect(page.getByLabel(/Username/i)).toBeVisible();
    await expect(page.getByLabel(/Password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign in/i })).toBeVisible();

    // Filter the expected unauth chatter (401/403 from the proxied API
    // probes the shell makes) so only true bundle issues fail.
    const real = errors.filter((e) => {
        const lower = e.toLowerCase();
        if (lower.includes("401")) return false;
        if (lower.includes("403")) return false;
        if (lower.includes("unauthorized")) return false;
        if (lower.includes("failed to fetch")) return false;
        if (lower.includes("net::err_aborted")) return false;
        if (lower.includes("favicon")) return false;
        return true;
    });
    expect(real, real.join("\n")).toEqual([]);
});
