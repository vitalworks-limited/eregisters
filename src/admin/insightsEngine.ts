import dayjs from "dayjs";
import { SyncTelemetry } from "../sync/telemetry";

/**
 * Rules-based root-cause analyzer.
 *
 * Pure function — takes the same shape the Admin pages already have on
 * hand (local sync telemetry + pending counts + last pull timestamps)
 * and emits a list of Insight cards. Each card carries severity,
 * evidence, recommendation, and owner so admins can act without reading
 * raw logs.
 */

export type Severity = "info" | "warning" | "high" | "critical";

export type Owner = "developer" | "dhis2-admin" | "facility" | "support";

export interface Insight {
    id: string;
    severity: Severity;
    title: string;
    evidence: string[];
    likelyCause: string;
    recommendation: string;
    owner: Owner;
    /** "now" / "today" / "this-week" / "next-release". */
    urgency: "now" | "today" | "this-week" | "next-release";
    /** Confidence in this finding given the evidence available. */
    confidence: "low" | "medium" | "high";
}

export interface InsightsInputs {
    telemetry: SyncTelemetry[];
    pendingTrackedEntities: number;
    pendingEnrollments: number;
    pendingEvents: number;
    lastMetadataPull?: string;
    lastDataPull?: string;
    appVersion?: string;
    buildHash?: string;
}

const PROGRAM_NAME = "Medical Registers"; // for narrative text

export function generateInsights(input: InsightsInputs): Insight[] {
    const insights: Insight[] = [];
    const t = input.telemetry;
    const total = t.length;
    const failed = t.filter((x) => (x.failures?.length ?? 0) > 0);
    const failedRate = total === 0 ? 0 : (failed.length / total) * 100;

    // 1. High failure rate.
    if (failedRate >= 10) {
        const lastMessages = failed
            .slice(0, 3)
            .map((f) => f.failures?.[0]?.message)
            .filter(Boolean) as string[];
        insights.push({
            id: "high-failure-rate",
            severity: failedRate >= 30 ? "critical" : "high",
            title: `${Math.round(failedRate)}% of sync runs failing`,
            evidence: [
                `${failed.length} failures across the last ${total} sync runs`,
                ...lastMessages.map((m) => `Sample: ${m.slice(0, 120)}`),
            ],
            likelyCause:
                "Either DHIS2 is rejecting requests (4xx/5xx) or the device is offline mid-pull. Inspect the last error messages.",
            recommendation:
                "Open Sync activity → expand a failed row to see the endpoint and HTTP status. If it's 5xx, check DHIS2 server load. If 4xx, double-check the program / org-unit assignment for affected users.",
            owner: failedRate >= 30 ? "dhis2-admin" : "support",
            urgency: failedRate >= 30 ? "now" : "today",
            confidence: lastMessages.length >= 2 ? "high" : "medium",
        });
    }

    // 2. Skipped / no-op heavy ratio — often kill-switch left engaged or
    //    lock contention.
    const noopOrSkipped = t.filter((x) => {
        if (!x.finishedAt) return false;
        const noWork =
            (x.trackedEntitiesPulled ?? 0) === 0 &&
            (x.eventsPulled ?? 0) === 0 &&
            (x.trackerPosts ?? 0) === 0;
        return noWork;
    });
    if (total > 4 && noopOrSkipped.length / total > 0.5) {
        insights.push({
            id: "skipped-storm",
            severity: "warning",
            title: "Most sync attempts are bailing out early",
            evidence: [
                `${noopOrSkipped.length} of ${total} runs did no work`,
                "Sub-second duration suggests a lock or kill switch is short-circuiting the pull",
            ],
            likelyCause:
                "The kill switch may still be engaged, the device may be outside an allowed sync window, or another tab holds the per-browser lock.",
            recommendation:
                "Open Config and confirm the kill switch is disengaged and the current time falls inside an allowed window. If neither, ask the user to close duplicate tabs of the app.",
            owner: "dhis2-admin",
            urgency: "today",
            confidence: "medium",
        });
    }

    // 3. Stale data pull.
    if (
        input.lastDataPull &&
        dayjs().diff(dayjs(input.lastDataPull), "hour") >= 24
    ) {
        const hours = dayjs().diff(dayjs(input.lastDataPull), "hour");
        insights.push({
            id: "stale-data-pull",
            severity: hours >= 72 ? "high" : "warning",
            title: `No data pull in ${hours} hours`,
            evidence: [`Last successful pull at ${dayjs(input.lastDataPull).format("MMM D, HH:mm")}`],
            likelyCause:
                "Either the device has been offline, the scheduler is paused (kill switch / window), or the user hasn't opened the app in a while.",
            recommendation:
                "Confirm the device has connectivity, then trigger a manual pull from the sync popover. If pulls keep stalling, file a support ticket with the troubleshooting bundle.",
            owner: "facility",
            urgency: hours >= 72 ? "today" : "this-week",
            confidence: "high",
        });
    }

    // 4. Stale metadata.
    if (
        input.lastMetadataPull &&
        dayjs().diff(dayjs(input.lastMetadataPull), "hour") >= 72
    ) {
        insights.push({
            id: "stale-metadata",
            severity: "warning",
            title: "Metadata is older than 72 hours",
            evidence: [
                `Last metadata pull at ${dayjs(input.lastMetadataPull).format("MMM D, HH:mm")}`,
            ],
            likelyCause:
                "The version-gated probe is short-circuiting, or the device hasn't reconnected since the last program version bump.",
            recommendation:
                "Open the sync popover and trigger Sync metadata. If the probe keeps returning the same version, no action is needed — the program hasn't changed upstream.",
            owner: "facility",
            urgency: "this-week",
            confidence: "medium",
        });
    }

    // 5. Push backlog.
    const totalPending =
        input.pendingTrackedEntities +
        input.pendingEnrollments +
        input.pendingEvents;
    if (totalPending >= 50) {
        insights.push({
            id: "push-backlog",
            severity: totalPending >= 500 ? "critical" : "high",
            title: `${totalPending} records waiting to push`,
            evidence: [
                `${input.pendingTrackedEntities} tracked entities, ${input.pendingEnrollments} enrollments, ${input.pendingEvents} events`,
            ],
            likelyCause:
                "Either the device has been offline for an extended time, or pushes are failing silently against DHIS2.",
            recommendation:
                "Trigger Push data from the sync popover. If failures persist, inspect Sync activity for the most recent push run and read the failure details.",
            owner: "facility",
            urgency: totalPending >= 500 ? "now" : "today",
            confidence: "high",
        });
    }

    // 6. Slow average sync — load smell.
    const completed = t.filter((x) => x.finishedAt);
    if (completed.length >= 3) {
        const avg =
            completed.reduce(
                (s, x) => s + dayjs(x.finishedAt).diff(dayjs(x.startedAt)),
                0,
            ) / completed.length;
        if (avg > 30_000) {
            insights.push({
                id: "slow-syncs",
                severity: avg > 60_000 ? "high" : "warning",
                title: `Average sync run takes ${(avg / 1000).toFixed(1)} s`,
                evidence: [
                    `${completed.length} runs averaged > 30 s`,
                    "This typically points at large page sizes or unfiltered fetches.",
                ],
                likelyCause: `The app is pulling large payloads against the ${PROGRAM_NAME} program. The recent sync stabilisation reduced pageSize and field shape; check the device's bundle version.`,
                recommendation:
                    "Confirm the device is on the latest app build (footer should show the current build hash). If yes and pulls are still slow, file a developer ticket with a troubleshooting bundle.",
                owner: "developer",
                urgency: "this-week",
                confidence: "medium",
            });
        }
    }

    return insights;
}

export const SEVERITY_COLOR: Record<Severity, string> = {
    info: "#0EA5E9",
    warning: "#D97706",
    high: "#F97316",
    critical: "#DC2626",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
    info: "Info",
    warning: "Watch",
    high: "High",
    critical: "Critical",
};
