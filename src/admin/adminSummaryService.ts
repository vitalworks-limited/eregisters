import type { useDataEngine } from "@dhis2/app-runtime";
import { assertAdminOverviewSafeRequest } from "./adminSafeQueryGuard";
import { FIXTURE_OVERVIEW } from "./summaryFixture";
import {
    AdminOverviewSummary,
    AdminSummaryOrgUnit,
    PeriodType,
} from "./summaryTypes";

type Engine = ReturnType<typeof useDataEngine>;

export const MONITORING_NAMESPACE = "eregisters-admin-monitoring";

export interface OverviewQuery {
    period: PeriodType;
    /** ISO date for CUSTOM period start; ignored otherwise. */
    customStart?: string;
    customEnd?: string;
    orgUnit: AdminSummaryOrgUnit;
}

/**
 * Bounds when a missing fact is treated as `unknown` vs. `degraded`.
 * Pure heuristics — the production summarizer can override via the
 * stored `status` field.
 */
export const FRESHNESS_LIMITS = {
    overviewTtlSeconds: 15 * 60,
    staleSoftCapSeconds: 60 * 60,
};

function dataStoreKey(q: OverviewQuery): string {
    return `overview/${q.period}/${q.orgUnit.id}/${q.orgUnit.scope}`;
}

export interface FetchedOverview {
    summary: AdminOverviewSummary;
    /**
     * Where the data actually came from this read. The source on the
     * summary itself only describes the *generator*; this tells the UI
     * whether the read was live, cached, or the dev fixture.
     */
    deliveredBy: "datastore" | "fixture" | "no-data";
}

/**
 * Reads the Admin Overview summary from the dataStore namespace. Falls
 * back to the development fixture only when explicitly allowed, and
 * never executes a live tracker query.
 *
 * The DHIS2 dataEngine path doesn't go through `fetch`, but we still
 * assert the resource URL against the safe-query guard so any future
 * refactor that introduces a raw fetch is caught.
 */
export async function fetchOverviewSummary(
    engine: Engine,
    query: OverviewQuery,
    { allowFixtureFallback = true }: { allowFixtureFallback?: boolean } = {},
): Promise<FetchedOverview> {
    const key = dataStoreKey(query);
    const resource = `dataStore/${MONITORING_NAMESPACE}/${key}`;
    assertAdminOverviewSafeRequest(`/api/${resource}`);

    try {
        const result = (await engine.query({
            value: { resource },
        })) as { value?: AdminOverviewSummary };
        if (result.value) {
            return decorateFreshness({
                summary: result.value,
                deliveredBy: "datastore",
            });
        }
    } catch {
        // 404 / 403 / network — fall through to fixture or no-data.
    }

    if (allowFixtureFallback) {
        return decorateFreshness({
            summary: applyFixtureScope(FIXTURE_OVERVIEW, query),
            deliveredBy: "fixture",
        });
    }
    return {
        summary: applyFixtureScope(emptySummary(query), query),
        deliveredBy: "no-data",
    };
}

function decorateFreshness(out: FetchedOverview): FetchedOverview {
    try {
        const generated = new Date(out.summary.cache.generatedAt).getTime();
        const age = Math.max(
            0,
            Math.floor((Date.now() - generated) / 1000),
        );
        const ttl = out.summary.cache.ttlSeconds || FRESHNESS_LIMITS.overviewTtlSeconds;
        out.summary.cache.ageSeconds = age;
        out.summary.cache.ttlSeconds = ttl;
        out.summary.cache.isStale = age > ttl;
    } catch {
        // ignore parse errors and leave whatever the source provided
    }
    return out;
}

function applyFixtureScope(
    base: AdminOverviewSummary,
    query: OverviewQuery,
): AdminOverviewSummary {
    return {
        ...base,
        period: {
            type: query.period,
            startDate:
                query.period === "CUSTOM" && query.customStart
                    ? query.customStart
                    : base.period.startDate,
            endDate:
                query.period === "CUSTOM" && query.customEnd
                    ? query.customEnd
                    : base.period.endDate,
        },
        orgUnit: query.orgUnit,
    };
}

export function emptySummary(query: OverviewQuery): AdminOverviewSummary {
    const generatedAt = new Date().toISOString();
    return {
        schemaVersion: "1.0.0",
        summaryType: "overview",
        period: {
            type: query.period,
            startDate: query.customStart ?? generatedAt.slice(0, 10),
            endDate: query.customEnd ?? generatedAt.slice(0, 10),
        },
        orgUnit: query.orgUnit,
        cache: {
            source: "unknown",
            generatedAt,
            ageSeconds: 0,
            ttlSeconds: FRESHNESS_LIMITS.overviewTtlSeconds,
            isStale: false,
        },
        cards: {
            facilitiesUsingERegistry: nullMetric(
                "facilitiesUsingERegistry",
                "Facilities Using eRegistry",
            ),
            registeredUsers: nullMetric(
                "registeredUsers",
                "Registered Users",
            ),
            activeUsers: nullMetric("activeUsers", "Active Users"),
            registeredClients: nullMetric(
                "registeredClients",
                "Registered Clients",
            ),
            totalEncounters: nullMetric(
                "totalEncounters",
                "Total Encounters",
            ),
            syncHealth: nullMetric("syncHealth", "Sync Health"),
            systemPressure: nullMetric("systemPressure", "System Pressure"),
            trackerGets: nullMetric("trackerGets", "Tracker GETs"),
            trackerPosts: nullMetric("trackerPosts", "Tracker POSTs"),
            slowRequests: nullMetric("slowRequests", "Slow Requests"),
            responseVolumeMb: nullMetric(
                "responseVolumeMb",
                "Tracker Response Volume",
            ),
            unsafePatternCount: nullMetric(
                "unsafePatternCount",
                "Unsafe Sync Patterns",
            ),
            appVersionStatus: nullMetric(
                "appVersionStatus",
                "App Version Status",
            ),
            jobBacklog: nullMetric("jobBacklog", "Tracker Job Backlog"),
            operationalAlerts: nullMetric(
                "operationalAlerts",
                "Operational Alerts",
            ),
        },
        facilityRiskMap: [],
        topFacilities: [],
        alerts: [],
        recommendations: [],
    };
}

function nullMetric(key: string, label: string) {
    return {
        key,
        label,
        value: null,
        status: "unknown" as const,
        source: "unknown" as const,
    };
}

export function periodRange(p: PeriodType): { start: string; end: string } {
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const start = new Date(today);
    const end = new Date(today);
    switch (p) {
        case "TODAY":
            break;
        case "YESTERDAY":
            start.setDate(today.getDate() - 1);
            end.setDate(today.getDate() - 1);
            break;
        case "LAST_7_DAYS":
            start.setDate(today.getDate() - 6);
            break;
        case "LAST_30_DAYS":
            start.setDate(today.getDate() - 29);
            break;
        case "THIS_MONTH":
            start.setDate(1);
            break;
        case "LAST_MONTH": {
            const lastMonth = new Date(
                today.getFullYear(),
                today.getMonth() - 1,
                1,
            );
            const lastMonthEnd = new Date(
                today.getFullYear(),
                today.getMonth(),
                0,
            );
            return { start: iso(lastMonth), end: iso(lastMonthEnd) };
        }
        case "THIS_QUARTER": {
            const quarter = Math.floor(today.getMonth() / 3);
            const qStart = new Date(today.getFullYear(), quarter * 3, 1);
            return { start: iso(qStart), end: iso(today) };
        }
        case "THIS_YEAR":
            return {
                start: `${today.getFullYear()}-01-01`,
                end: iso(today),
            };
        case "CUSTOM":
            // Caller supplies dates explicitly.
            return { start: iso(today), end: iso(today) };
    }
    return { start: iso(start), end: iso(end) };
}
