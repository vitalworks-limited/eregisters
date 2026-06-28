/**
 * Safe-query guard for Admin Overview reads.
 *
 * Why: the Admin Overview's whole point is to monitor the cluster
 * without recreating the sync-storm that justified building it. We
 * therefore refuse to issue heavy tracker queries from the browser when
 * the call originates in an `ADMIN_OVERVIEW` context. The legitimate
 * sync workers run with a different context, so this guard is scoped
 * narrowly — it doesn't interfere with normal data pull/push.
 */

export type AdminQueryContext =
    | "ADMIN_OVERVIEW"
    | "ADMIN_DRILLDOWN"
    | "ADMIN_CONFIG"
    | "SYNC"
    | "USER";

export interface SafeQueryViolation {
    pattern: string;
    detail: string;
}

/**
 * Count-only tracker reads are tolerated when the URL pins
 * `pageSize=1` (return just one row + the page metadata). That's a
 * single tiny request — fundamentally not a sync storm — but it lets
 * the dashboard show real enrolment / event totals.
 */
function isCountOnlyTrackerProbe(url: string): boolean {
    return (
        /[?&]pageSize=1\b/.test(url) &&
        /[?&]totalPages=true\b/.test(url) &&
        !/fields=\*/.test(url) &&
        !/events\[\*\]/.test(url) &&
        !/enrollments\[[^\]]*events\[\*\]/.test(url)
    );
}

const UNSAFE_PATTERNS: { test: (url: string) => SafeQueryViolation | null }[] = [
    {
        test: (url) =>
            /\/tracker\/trackedEntities/.test(url) &&
            !isCountOnlyTrackerProbe(url)
                ? {
                      pattern: "tracker/trackedEntities",
                      detail:
                          "Admin Overview must read precomputed summaries — never the live tracker export. (Count-only probes with pageSize=1&totalPages=true are permitted.)",
                  }
                : null,
    },
    {
        test: (url) =>
            /\/tracker\/events(?!\/?[\w-]*$)/.test(url) &&
            !/dataValuesOnly=true/.test(url) &&
            !isCountOnlyTrackerProbe(url)
                ? {
                      pattern: "tracker/events",
                      detail:
                          "Admin Overview must use cached event counts, not live tracker/events. (Count-only probes with pageSize=1&totalPages=true are permitted.)",
                  }
                : null,
    },
    {
        test: (url) =>
            /fields=\*/.test(url)
                ? {
                      pattern: "fields=*",
                      detail:
                          "fields=* fetches every column — read summaries with explicit fields instead.",
                  }
                : null,
    },
    {
        test: (url) =>
            /enrollments\[[^\]]*events\[\*\]/.test(url) || /events\[\*\]/.test(url)
                ? {
                      pattern: "events[*]",
                      detail:
                          "Nested events[*] inflates response size — keep Admin Overview reads flat.",
                  }
                : null,
    },
    {
        test: (url) =>
            /[?&]pageSize=100\b/.test(url)
                ? {
                      pattern: "pageSize=100",
                      detail:
                          "pageSize=100 was the historic trigger for the sync storm — block in Admin Overview.",
                  }
                : null,
    },
    {
        test: (url) =>
            /\/tracker(\?|\b)/.test(url) && /async=false/.test(url)
                ? {
                      pattern: "tracker?async=false",
                      detail:
                          "Synchronous bulk tracker imports are forbidden from the Admin Overview path.",
                  }
                : null,
    },
];

/**
 * Inspects a URL and throws when the call would breach the Admin
 * Overview's safe-read contract. No-op for non-Overview contexts so
 * normal sync code is unaffected.
 */
export function assertAdminOverviewSafeRequest(
    url: string,
    context: AdminQueryContext = "ADMIN_OVERVIEW",
): void {
    if (context !== "ADMIN_OVERVIEW" && context !== "ADMIN_DRILLDOWN") return;
    const decoded = (() => {
        try {
            return decodeURIComponent(url);
        } catch {
            return url;
        }
    })();
    for (const rule of UNSAFE_PATTERNS) {
        const hit = rule.test(decoded);
        if (hit) {
            throw new Error(
                `Unsafe Admin Overview request blocked (${hit.pattern}): ${hit.detail} URL: ${decoded}`,
            );
        }
    }
}

/**
 * Non-throwing check — returns the first violation it spots, or null
 * when the URL is safe. Useful for logging without crashing the UI.
 */
export function detectUnsafeAdminRequest(
    url: string,
): SafeQueryViolation | null {
    const decoded = (() => {
        try {
            return decodeURIComponent(url);
        } catch {
            return url;
        }
    })();
    for (const rule of UNSAFE_PATTERNS) {
        const hit = rule.test(decoded);
        if (hit) return hit;
    }
    return null;
}
