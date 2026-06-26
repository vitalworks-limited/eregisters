/**
 * Retry policy for sync requests.
 *
 * Why: production showed individual trackedEntities requests taking 12+
 * minutes before returning 500, then immediately being retried by the
 * client. The retry storm amplified DHIS2 load. This policy backs off
 * across minutes and stops after a small number of attempts so the
 * server has time to recover.
 */

/** Names of failures we consider retriable but only with backoff. */
export type RetriableFailureKind =
    | "429"
    | "500"
    | "502"
    | "503"
    | "504"
    | "network-timeout"
    | "connection-timeout";

export const MAX_AUTOMATIC_RETRIES = 3;

/**
 * Returns the delay before the next retry, in milliseconds, or null if
 * the caller should stop and require manual retry.
 */
export function getRetryDelayMs(failureCount: number): number | null {
    if (failureCount <= 0) return 0;
    if (failureCount === 1) return 5 * 60 * 1000;
    if (failureCount === 2) return 15 * 60 * 1000;
    if (failureCount === 3) return 30 * 60 * 1000;
    return null;
}

/**
 * Returns true if the supplied error/status describes one of the
 * retriable failure conditions defined above.
 */
export function isRetriableFailure(input: {
    status?: number | string;
    code?: string;
    message?: string;
}): boolean {
    const raw = input.status;
    if (raw !== undefined && raw !== null) {
        const status = typeof raw === "string" ? parseInt(raw, 10) : raw;
        if (
            status === 429 ||
            status === 500 ||
            status === 502 ||
            status === 503 ||
            status === 504
        ) {
            return true;
        }
    }
    const text = `${input.code ?? ""} ${input.message ?? ""}`.toLowerCase();
    if (
        text.includes("timeout") ||
        text.includes("etimedout") ||
        text.includes("econnreset") ||
        text.includes("network") ||
        text.includes("fetch failed")
    ) {
        return true;
    }
    return false;
}

/**
 * User-facing message recommended when sync has been deferred due to
 * server pressure.
 */
export const RETRY_DEFERRED_USER_MESSAGE =
    "Sync is delayed because the server is busy. The app will retry later. " +
    "You can continue using saved local data.";

/**
 * Classify an HTTP status / error into a `RetriableFailureKind`, or
 * undefined if not retriable.
 */
export function classifyFailure(input: {
    status?: number | string;
    code?: string;
    message?: string;
}): RetriableFailureKind | undefined {
    const raw = input.status;
    if (raw !== undefined && raw !== null) {
        const status =
            typeof raw === "string" ? parseInt(raw, 10) : raw;
        if (status === 429) return "429";
        if (status === 500) return "500";
        if (status === 502) return "502";
        if (status === 503) return "503";
        if (status === 504) return "504";
    }
    const text = `${input.code ?? ""} ${input.message ?? ""}`.toLowerCase();
    if (text.includes("timeout") || text.includes("etimedout")) {
        return text.includes("connection")
            ? "connection-timeout"
            : "network-timeout";
    }
    if (
        text.includes("econnreset") ||
        text.includes("network") ||
        text.includes("fetch failed")
    ) {
        return "network-timeout";
    }
    return undefined;
}
