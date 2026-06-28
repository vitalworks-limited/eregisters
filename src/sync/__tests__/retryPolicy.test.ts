import {
    MAX_AUTOMATIC_RETRIES,
    classifyFailure,
    getRetryDelayMs,
    isRetriableFailure,
} from "../retryPolicy";

describe("retry policy", () => {
    test("backoff increases with each failure", () => {
        expect(getRetryDelayMs(0)).toBe(0);
        expect(getRetryDelayMs(1)).toBe(5 * 60 * 1000);
        expect(getRetryDelayMs(2)).toBe(15 * 60 * 1000);
        expect(getRetryDelayMs(3)).toBe(30 * 60 * 1000);
    });

    test("after MAX_AUTOMATIC_RETRIES, getRetryDelayMs returns null", () => {
        expect(getRetryDelayMs(MAX_AUTOMATIC_RETRIES + 1)).toBeNull();
        expect(getRetryDelayMs(99)).toBeNull();
    });

    test.each([429, 500, 502, 503, 504])(
        "%s status is retriable",
        (status) => {
            expect(isRetriableFailure({ status })).toBe(true);
            expect(classifyFailure({ status })).toBe(String(status));
        },
    );

    test("network timeout messages classify as retriable", () => {
        expect(isRetriableFailure({ message: "Request timeout" })).toBe(true);
        expect(isRetriableFailure({ code: "ETIMEDOUT" })).toBe(true);
        expect(isRetriableFailure({ message: "fetch failed" })).toBe(true);
        expect(classifyFailure({ message: "connection timeout" })).toBe(
            "connection-timeout",
        );
    });

    test("4xx client errors (not 429) are NOT retriable", () => {
        expect(isRetriableFailure({ status: 400 })).toBe(false);
        expect(isRetriableFailure({ status: 404 })).toBe(false);
        expect(isRetriableFailure({ status: 409 })).toBe(false);
    });
});
