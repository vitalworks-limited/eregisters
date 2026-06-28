import { HealthStatus, OverviewCards } from "./summaryTypes";

/**
 * Computes a transparent 0-100 health score for the Admin Overview.
 * The numeric value is unused in the UI, but the band drives the
 * top-of-page status pill. Each penalty is documented so admins can
 * understand why the score moved.
 */
export interface OverviewHealth {
    score: number;
    band: HealthStatus;
    penalties: { reason: string; delta: number }[];
}

const THRESHOLDS = {
    trackerGetsPerHour: 1000,
    trackerPostsPerHour: 1000,
    responseVolumeMb: 500,
    slowRequests: 50,
    unsafePatterns: 1,
    asyncFalseBulkImports: 1,
    jobBacklog: 25,
    oldAppSessions: 5,
};

export function calculateAdminOverviewHealth(
    cards: OverviewCards,
): OverviewHealth {
    let score = 100;
    const penalties: { reason: string; delta: number }[] = [];

    const num = (v: number | string | null) =>
        typeof v === "number" ? v : 0;

    if (num(cards.trackerGets.value) > THRESHOLDS.trackerGetsPerHour) {
        score -= 20;
        penalties.push({
            reason: `Tracker GET volume ${cards.trackerGets.value} above ${THRESHOLDS.trackerGetsPerHour}`,
            delta: -20,
        });
    }
    if (num(cards.trackerPosts.value) > THRESHOLDS.trackerPostsPerHour) {
        score -= 20;
        penalties.push({
            reason: `Tracker POST volume ${cards.trackerPosts.value} above ${THRESHOLDS.trackerPostsPerHour}`,
            delta: -20,
        });
    }
    if (num(cards.responseVolumeMb.value) > THRESHOLDS.responseVolumeMb) {
        score -= 15;
        penalties.push({
            reason: `Response volume ${cards.responseVolumeMb.value} MB above ${THRESHOLDS.responseVolumeMb}`,
            delta: -15,
        });
    }
    if (num(cards.slowRequests.value) > THRESHOLDS.slowRequests) {
        score -= 15;
        penalties.push({
            reason: `Slow requests ${cards.slowRequests.value} above ${THRESHOLDS.slowRequests}`,
            delta: -15,
        });
    }
    if (num(cards.unsafePatternCount.value) >= THRESHOLDS.unsafePatterns) {
        score -= 15;
        penalties.push({
            reason: `Unsafe sync patterns detected (${cards.unsafePatternCount.value})`,
            delta: -15,
        });
    }
    if (num(cards.jobBacklog.value) > THRESHOLDS.jobBacklog) {
        score -= 10;
        penalties.push({
            reason: `Tracker job backlog ${cards.jobBacklog.value} above ${THRESHOLDS.jobBacklog}`,
            delta: -10,
        });
    }
    if (cards.appVersionStatus.status === "watch") {
        score -= 5;
        penalties.push({
            reason: "Mixed app version sessions detected",
            delta: -5,
        });
    }
    if (cards.appVersionStatus.status === "degraded") {
        score -= 10;
        penalties.push({
            reason: "Old app sessions still running",
            delta: -10,
        });
    }
    if (cards.systemPressure.status === "degraded") {
        score -= 10;
        penalties.push({
            reason: "System pressure degraded (Hikari / Tomcat / DB)",
            delta: -10,
        });
    }
    if (cards.systemPressure.status === "critical") {
        score -= 20;
        penalties.push({
            reason: "System pressure critical (Hikari / Tomcat / DB)",
            delta: -20,
        });
    }

    score = Math.max(0, Math.min(100, score));
    return { score, band: bandForScore(score, cards), penalties };
}

function bandForScore(
    score: number,
    cards: OverviewCards,
): HealthStatus {
    // Treat the band as "unknown" only when every card is unknown —
    // a single signal is enough to assign confidence.
    const allUnknown = Object.values(cards).every(
        (m) => m.status === "unknown",
    );
    if (allUnknown) return "unknown";
    if (score >= 85) return "healthy";
    if (score >= 70) return "watch";
    if (score >= 50) return "degraded";
    return "critical";
}
