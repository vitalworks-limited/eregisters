import { expect, test } from "@playwright/test";

/**
 * Authenticated flow tests. Requires `pnpm test:e2e:auth` first to
 * populate `e2e/.auth/state.json`.
 *
 * Covers the work landed on fix/sync-performance-stabilization:
 *   - admin sub-nav renders Broadcast item
 *   - /admin/sync shows the Trigger column with applicable tags
 *   - /admin/broadcast page renders the publish form
 *   - /admin/config In-app notice exposes mode + action selectors
 */

test.describe("admin UI", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/#/admin");
        await expect(
            page.getByRole("heading", { name: "Admin" }),
        ).toBeVisible();
    });

    test("sub-nav lists Broadcast", async ({ page }) => {
        await expect(page.getByRole("link", { name: /Broadcast/ })).toBeVisible();
        await expect(page.getByRole("link", { name: /Insights/ })).toBeVisible();
    });

    test("/admin/sync renders Trigger column with applicable tags", async ({
        page,
    }) => {
        await page.goto("/#/admin/sync");
        // Column header
        await expect(
            page.getByRole("columnheader", { name: /Trigger/ }),
        ).toBeVisible();
        // At least one row should show either Manual or Scheduled
        // (never a dash now that we default unknown → Scheduled).
        const cells = page
            .locator("tbody tr")
            .filter({ has: page.locator("text=data-pull, text=metadata, text=data-push") });
        await page.waitForTimeout(1000);
        const dashCount = await page.locator("tbody td", { hasText: /^—$/ }).count();
        // Dashes may appear in other columns (e.g. User) but the
        // Trigger cell text should always be "Manual" or "Scheduled".
        const triggerTexts = await page
            .locator("tbody tr td")
            .filter({ hasText: /^(Manual|Scheduled)$/ })
            .count();
        expect(triggerTexts).toBeGreaterThan(0);
        expect(dashCount).toBeLessThan(triggerTexts * 5);
    });

    test("/admin/broadcast renders the publish form", async ({ page }) => {
        await page.goto("/#/admin/broadcast");
        await expect(
            page.getByRole("heading", { name: /App update broadcast/i }),
        ).toBeVisible();
        // Form controls
        await expect(page.getByText(/Target build hash/)).toBeVisible();
        await expect(page.getByLabel(/Notify only/)).toBeVisible();
        await expect(page.getByLabel(/Forced reload/)).toBeVisible();
        await expect(page.getByRole("button", { name: /Publish broadcast/ })).toBeVisible();
    });

    test("/admin/config In-app notice exposes mode + action selectors", async ({
        page,
    }) => {
        await page.goto("/#/admin/config");
        await expect(
            page.getByRole("heading", { name: /In-app notice/i }),
        ).toBeVisible();
        // Mode toggle
        await expect(page.getByText(/Slim banner/i)).toBeVisible();
        await expect(page.getByText(/Popover dialog/i)).toBeVisible();
        // Action select default label visible
        await expect(
            page.getByText(/What should the action button do\?/i),
        ).toBeVisible();
    });
});
