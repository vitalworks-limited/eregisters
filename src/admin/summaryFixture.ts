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
        facilitiesUsingERegistry: {
            key: "facilitiesUsingERegistry",
            label: "Facilities Using eRegistry",
            value: 1687,
            status: "healthy",
            source: "fixture",
        },
        registeredUsers: {
            key: "registeredUsers",
            label: "Registered Users",
            value: 15487,
            status: "healthy",
            source: "fixture",
        },
        activeUsers: {
            key: "activeUsers",
            label: "Active Users",
            value: 7997,
            status: "watch",
            source: "telemetry",
        },
        registeredClients: {
            key: "registeredClients",
            label: "Registered Clients",
            value: 666097,
            status: "healthy",
            source: "analytics",
        },
        totalEncounters: {
            key: "totalEncounters",
            label: "Total Encounters",
            value: 666198,
            status: "healthy",
            source: "analytics",
        },
        syncHealth: {
            key: "syncHealth",
            label: "Sync Health",
            value: "Watch",
            status: "watch",
            source: "access-log",
            helpText:
                "Combined score from sync volume, failed syncs, slow requests and queue status.",
        },
        systemPressure: {
            key: "systemPressure",
            label: "System Pressure",
            value: "Healthy",
            status: "healthy",
            source: "db-summary",
            helpText:
                "Hikari + Tomcat + DB connections + job backlog summaries.",
        },
        trackerGets: {
            key: "trackerGets",
            label: "Tracker GETs",
            value: 0,
            status: "healthy",
            source: "access-log",
        },
        trackerPosts: {
            key: "trackerPosts",
            label: "Tracker POSTs",
            value: 0,
            status: "healthy",
            source: "access-log",
        },
        slowRequests: {
            key: "slowRequests",
            label: "Slow Requests",
            value: 0,
            status: "healthy",
            source: "access-log",
        },
        responseVolumeMb: {
            key: "responseVolumeMb",
            label: "Tracker Response Volume",
            value: 0,
            unit: "MB",
            status: "healthy",
            source: "access-log",
        },
        unsafePatternCount: {
            key: "unsafePatternCount",
            label: "Unsafe Sync Patterns",
            value: 0,
            status: "healthy",
            source: "access-log",
        },
        appVersionStatus: {
            key: "appVersionStatus",
            label: "App Version Status",
            value: "Latest",
            status: "healthy",
            source: "telemetry",
        },
        jobBacklog: {
            key: "jobBacklog",
            label: "Tracker Job Backlog",
            value: 0,
            status: "healthy",
            source: "db-summary",
        },
        operationalAlerts: {
            key: "operationalAlerts",
            label: "Operational Alerts",
            value: 0,
            status: "healthy",
            source: "fixture",
        },
    },
    facilityRiskMap: [],
    topFacilities: [],
    alerts: [],
    recommendations: [],
};
