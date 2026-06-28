import { expect, test } from "@playwright/test";

/**
 * Unauthenticated smoke check. The dev server should boot the bundle
 * and load critical assets without console errors. Anything past this
 * point requires a DHIS2 session — see *.flows.spec.ts.
 */
test("dev server boots and bundle loads without console errors", async ({
    page,
}) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => {
        errors.push(`pageerror: ${err.message}`);
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // The shell injects this meta tag — confirms the index.html template
    // came back from d2-app-scripts.
    await expect(
        page.locator('meta[name="dhis2-base-url"]'),
    ).toHaveCount(1);

    // React mounts into this node — wait until it has children so we
    // know the bundle executed.
    await page.waitForFunction(
        () => {
            const root = document.getElementById("dhis2-app-root");
            return Boolean(root && root.children.length > 0);
        },
        { timeout: 20_000 },
    );

    // Allow a beat for any deferred bootstrap errors to surface.
    await page.waitForTimeout(1500);

    // Network-style "401 unauthorized" errors are expected in unauth
    // mode; filter the noise so only real bundle issues fail the test.
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
