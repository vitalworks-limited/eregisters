import {
    DEFAULT_TRACKER_PULL_PAGE_SIZE,
    EVENT_SYNC_FIELDS,
    INITIAL_LOOKBACK_HOURS,
    MAX_TRACKER_PULL_PAGE_SIZE,
    TRACKED_ENTITY_SYNC_FIELDS,
    isRetriableServerError,
    resolveUpdatedAfter,
} from "../config";

describe("sync config", () => {
    test("tracked entity sync fields must not include `*`", () => {
        expect(TRACKED_ENTITY_SYNC_FIELDS).not.toContain("=*");
        expect(TRACKED_ENTITY_SYNC_FIELDS.split(",")).not.toContain("*");
    });

    test("tracked entity sync fields must not nest events[*]", () => {
        expect(TRACKED_ENTITY_SYNC_FIELDS).not.toMatch(/events\[/);
    });

    test("event sync fields request minimal fields, not `*`", () => {
        expect(EVENT_SYNC_FIELDS).not.toContain("*");
        expect(EVENT_SYNC_FIELDS).toContain("event");
        expect(EVENT_SYNC_FIELDS).toContain("dataValues");
    });

    test("default tracker pull page size is small and below max", () => {
        expect(DEFAULT_TRACKER_PULL_PAGE_SIZE).toBeLessThanOrEqual(
            MAX_TRACKER_PULL_PAGE_SIZE,
        );
        expect(MAX_TRACKER_PULL_PAGE_SIZE).toBeLessThan(100);
    });
});

describe("resolveUpdatedAfter", () => {
    test("returns watermark when lastDataPull is set", () => {
        const t = "2026-06-25T10:00:00.000Z";
        expect(resolveUpdatedAfter(t, "incremental")).toBe(t);
    });

    test("returns undefined for full-manual-admin", () => {
        expect(
            resolveUpdatedAfter("2026-06-25T10:00:00.000Z", "full-manual-admin"),
        ).toBeUndefined();
        expect(resolveUpdatedAfter(undefined, "full-manual-admin")).toBeUndefined();
    });

    test("uses bounded lookback when no watermark", () => {
        const before = Date.now();
        const ts = resolveUpdatedAfter(undefined, "incremental");
        expect(ts).toBeDefined();
        const ms = new Date(ts!).getTime();
        const diff = before - ms;
        expect(diff).toBeGreaterThanOrEqual(
            INITIAL_LOOKBACK_HOURS * 60 * 60 * 1000 - 1000,
        );
        expect(diff).toBeLessThanOrEqual(
            INITIAL_LOOKBACK_HOURS * 60 * 60 * 1000 + 1000,
        );
    });
});

describe("isRetriableServerError", () => {
    test.each([429, 500, 502, 503, 504])("treats %s as retriable", (code) => {
        expect(isRetriableServerError(code)).toBe(true);
        expect(isRetriableServerError(String(code))).toBe(true);
    });

    test.each([200, 400, 404])("does not treat %s as retriable", (code) => {
        expect(isRetriableServerError(code)).toBe(false);
    });

    test("undefined is not retriable", () => {
        expect(isRetriableServerError(undefined)).toBe(false);
    });
});
