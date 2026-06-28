import { AdminOverviewSummary } from "./summaryTypes";

/**
 * Development-only fixture matching the schema in the delta spec.
 *
 * Production deployments should generate the summary via the operations
 * pipeline and persist it into the dataStore namespace
 * `eregisters-admin-monitoring`. The fixture lets the UI render before
 * ops has the pipeline wired up.
 */
export const FIXTURE_OVERVIEW: AdminOverviewSummary = {
    schemaVersion: "1.0.0",
    summaryType: "overview",
    period: {
        type: "THIS_YEAR",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
    },
    orgUnit: {
        id: "NATIONAL",
        name: "MOH - UGANDA",
        level: "national",
        scope: "NATIONAL",
    },
    cache: {
        source: "fixture",
        generatedAt: "2026-06-28T07:00:00+03:00",
        ageSeconds: 420,
        ttlSeconds: 900,
        isStale: false,
    },
    cards: {
        // These five are always hydrated from live DHIS2 hooks
        // (programs, users, count-only tracker probes). Leave the
        // fixture values null so nothing fake ever flashes on screen
        // before the live values arrive.
        facilitiesUsingERegistry: {
            key: "facilitiesUsingERegistry",
            label: "Facilities Using eRegistry",
            value: null,
            status: "unknown",
            source: "unknown",
        },
        registeredUsers: {
            key: "registeredUsers",
            label: "Registered Users",
            value: null,
            status: "unknown",
            source: "unknown",
        },
        activeUsers: {
            key: "activeUsers",
            label: "Active Users",
            value: null,
            status: "unknown",
            source: "unknown",
        },
        registeredClients: {
            key: "registeredClients",
            label: "Registered Clients",
            value: null,
            status: "unknown",
            source: "unknown",
        },
        totalEncounters: {
            key: "totalEncounters",
            label: "Total Encounters",
            value: null,
            status: "unknown",
            source: "unknown",
        },
        // Operational signals come from the server-side summary
        // pipeline (Tomcat logs, DB summary, jobconfiguration). Leave
        // these null until ops publishes them to the dataStore.
        syncHealth: {
            key: "syncHealth",
            label: "Sync Health",
            value: null,
            status: "unknown",
            source: "unknown",
            helpText:
                "Combined score from sync volume, failed syncs, slow requests and queue status.",
        },
        systemPressure: {
            key: "systemPressure",
            label: "System Pressure",
            value: null,
            status: "unknown",
            source: "unknown",
            helpText:
                "Hikari + Tomcat + DB connections + job backlog summaries.",
        },
        trackerGets: {
            key: "trackerGets",
            label: "Tracker GETs",
            value: null,
            status: "unknown",
            source: "unknown",
        },
        trackerPosts: {
            key: "trackerPosts",
            label: "Tracker POSTs",
            value: null,
            status: "unknown",
            source: "unknown",
        },
        slowRequests: {
            key: "slowRequests",
            label: "Slow Requests",
            value: null,
            status: "unknown",
            source: "unknown",
        },
        responseVolumeMb: {
            key: "responseVolumeMb",
            label: "Tracker Response Volume",
            value: null,
            unit: "MB",
            status: "unknown",
            source: "unknown",
        },
        unsafePatternCount: {
            key: "unsafePatternCount",
            label: "Unsafe Sync Patterns",
            value: null,
            status: "unknown",
            source: "unknown",
        },
        appVersionStatus: {
            key: "appVersionStatus",
            label: "App Version Status",
            value: null,
            status: "unknown",
            source: "unknown",
        },
        jobBacklog: {
            key: "jobBacklog",
            label: "Tracker Job Backlog",
            value: null,
            status: "unknown",
            source: "unknown",
        },
        operationalAlerts: {
            key: "operationalAlerts",
            label: "Operational Alerts",
            value: null,
            status: "unknown",
            source: "unknown",
        },
    },
    facilityRiskMap: [],
    topFacilities: [],
    alerts: [],
    recommendations: [],
};

