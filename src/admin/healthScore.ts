import dayjs from "dayjs";
import { SyncTelemetry } from "../sync/telemetry";

/**
 * National / facility-level "is this app healthy" score.
 *
 * Score starts at 100 and gets penalised for the patterns documented in
 * the eRegisters Admin UI plan §5.2. We deliberately keep the model
 * transparent — every contributing penalty surfaces in the Insights page
 * so admins see why the score dropped, not just what it is.
 */

export type HealthBand = "Healthy" | "Watch" | "Degraded" | "Critical";

export interface HealthEvidence {
    label: string;
    delta: number; // negative number, e.g. -15
}

export interface HealthScoreResult {
    score: number;
    band: HealthBand;
    evidence: HealthEvidence[];
}

export interface HealthInputs {
    telemetry: SyncTelemetry[];
    pendingTrackedEntities: number;
    pendingEnrollments: number;
    pendingEvents: number;
    /** Most recent metadata pull timestamp on this device, if any. */
    lastMetadataPull?: string;
    /** Most recent data pull timestamp on this device, if any. */
    lastDataPull?: string;
}

const FAILURE_RATE_THRESHOLD = 10; // percent
const STALE_PENDING_HOURS = 24;
const STALE_METADATA_HOURS = 72;
const HIGH_PENDING_COUNT = 50;

export function computeHealthScore(input: HealthInputs): HealthScoreResult {
    let score = 100;
    const evidence: HealthEvidence[] = [];

    const totalSyncs = input.telemetry.length;
    const failed = input.telemetry.filter(
        (t) => (t.failures?.length ?? 0) > 0,
    ).length;
    const failureRate =
        totalSyncs === 0 ? 0 : Math.round((failed / totalSyncs) * 100);

    if (failureRate >= FAILURE_RATE_THRESHOLD) {
        const delta = failureRate >= 25 ? -20 : -10;
        evidence.push({
            label: `Sync failure rate ${failureRate}%`,
            delta,
        });
        score += delta;
    }

    const totalPending =
        input.pendingTrackedEntities +
        input.pendingEnrollments +
        input.pendingEvents;
    if (totalPending >= HIGH_PENDING_COUNT) {
        const delta = totalPending >= 500 ? -20 : -10;
        evidence.push({
            label: `${totalPending} records pending push`,
            delta,
        });
        score += delta;
    }

    if (
        input.lastDataPull &&
        dayjs().diff(dayjs(input.lastDataPull), "hour") >= STALE_PENDING_HOURS
    ) {
        evidence.push({
            label: `No data pull in ${dayjs().diff(
                dayjs(input.lastDataPull),
                "hour",
            )} h`,
            delta: -10,
        });
        score -= 10;
    }

    if (
        input.lastMetadataPull &&
        dayjs().diff(dayjs(input.lastMetadataPull), "hour") >=
            STALE_METADATA_HOURS
    ) {
        evidence.push({
            label: `Metadata >${STALE_METADATA_HOURS}h old`,
            delta: -10,
        });
        score -= 10;
    }

    // Long-running syncs are a load smell.
    const slowSyncs = input.telemetry.filter((t) => {
        if (!t.finishedAt) return false;
        return dayjs(t.finishedAt).diff(dayjs(t.startedAt)) > 30_000;
    }).length;
    if (slowSyncs >= 3) {
        evidence.push({
            label: `${slowSyncs} syncs over 30 s`,
            delta: -10,
        });
        score -= 10;
    }

    if (score < 0) score = 0;
    if (score > 100) score = 100;

    return { score, band: bandFor(score), evidence };
}

export function bandFor(score: number): HealthBand {
    if (score >= 85) return "Healthy";
    if (score >= 70) return "Watch";
    if (score >= 50) return "Degraded";
    return "Critical";
}

export function bandColor(band: HealthBand): string {
    switch (band) {
        case "Healthy":
            return "#16A34A";
        case "Watch":
            return "#D97706";
        case "Degraded":
            return "#F97316";
        case "Critical":
            return "#DC2626";
    }
}
