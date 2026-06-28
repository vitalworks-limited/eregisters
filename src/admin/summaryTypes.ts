/**
 * Type contract for the Admin Overview summary feed.
 *
 * The frontend consumes precomputed summary JSON either from the
 * DHIS2 dataStore namespace `eregisters-admin-monitoring`, a
 * backend `/api/apps/eregisters/admin/summary/*` endpoint, or a
 * static deployed JSON file. All three sources must return shapes
 * compatible with these interfaces.
 */

export type HealthStatus =
    | "healthy"
    | "watch"
    | "degraded"
    | "critical"
    | "unknown";

export type SummarySource =
    | "cached"
    | "datastore"
    | "analytics"
    | "telemetry"
    | "access-log"
    | "db-summary"
    | "fixture"
    | "unknown";

export type PeriodType =
    | "TODAY"
    | "YESTERDAY"
    | "LAST_7_DAYS"
    | "LAST_30_DAYS"
    | "THIS_MONTH"
    | "LAST_MONTH"
    | "THIS_QUARTER"
    | "THIS_YEAR"
    | "CUSTOM";

export type OrgUnitScope = "SELECTED" | "DESCENDANTS" | "NATIONAL";

export interface AdminSummaryPeriod {
    type: PeriodType;
    startDate: string;
    endDate: string;
}

export interface AdminSummaryOrgUnit {
    id: string;
    name: string;
    level?: string;
    scope: OrgUnitScope;
}

export interface CacheInfo {
    source: SummarySource;
    generatedAt: string;
    ageSeconds: number;
    ttlSeconds: number;
    isStale: boolean;
}

export interface SummaryMetric {
    key: string;
    label: string;
    value: number | string | null;
    unit?: string;
    status: HealthStatus;
    trend?: "up" | "down" | "flat" | "unknown";
    previousValue?: number | string | null;
    source: SummarySource;
    helpText?: string;
}

/**
 * Card set described by the delta spec. All cards are required so the
 * Overview can render a stable layout — sources that don't have data
 * still emit a metric with `value: null` and `status: "unknown"`.
 */
export interface OverviewCards {
    facilitiesUsingERegistry: SummaryMetric;
    registeredUsers: SummaryMetric;
    activeUsers: SummaryMetric;
    registeredClients: SummaryMetric;
    totalEncounters: SummaryMetric;
    syncHealth: SummaryMetric;
    systemPressure: SummaryMetric;
    trackerGets: SummaryMetric;
    trackerPosts: SummaryMetric;
    slowRequests: SummaryMetric;
    responseVolumeMb: SummaryMetric;
    unsafePatternCount: SummaryMetric;
    appVersionStatus: SummaryMetric;
    jobBacklog: SummaryMetric;
    operationalAlerts: SummaryMetric;
}

export interface FacilityRiskPoint {
    orgUnit: string;
    name: string;
    parentName?: string;
    districtName?: string;
    regionName?: string;
    latitude?: number;
    longitude?: number;
    status: HealthStatus;
    activeUsers: number;
    /**
     * Users currently signed in at this facility right now. Used by
     * the Dashboard map's "Active users" layer so only sessions that
     * are live show up, not anyone who touched the app earlier in the
     * period.
     */
    loggedInUsers?: number;
    trackerGets: number;
    trackerPosts: number;
    failedSyncs: number;
    slowRequests: number;
    responseMb: number;
    oldAppSessions: number;
    lastActivityAt?: string;
    riskReasons: string[];
}

export interface AdminAlert {
    id: string;
    severity: "info" | "warning" | "error" | "critical";
    title: string;
    description: string;
    evidence: string[];
    recommendedAction: string;
    affectedOrgUnits?: string[];
    affectedUsers?: number;
    firstSeenAt?: string;
    lastSeenAt?: string;
    status: "new" | "acknowledged" | "in_progress" | "resolved";
}

export interface AdminOverviewSummary {
    schemaVersion: string;
    summaryType: "overview";
    period: AdminSummaryPeriod;
    orgUnit: AdminSummaryOrgUnit;
    cache: CacheInfo;
    cards: OverviewCards;
    facilityRiskMap: FacilityRiskPoint[];
    topFacilities: FacilityRiskPoint[];
    alerts: AdminAlert[];
    recommendations: string[];
}

/**
 * Builds an empty metric for the card grid when the source is
 * unavailable — keeps the layout stable rather than showing
 * inconsistent rows.
 */
export function noDataMetric(
    key: keyof OverviewCards,
    label: string,
): SummaryMetric {
    return {
        key,
        label,
        value: null,
        status: "unknown",
        source: "unknown",
    };
}
