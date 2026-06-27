import dayjs from "dayjs";
import {
    DEFAULT_KILL_SWITCH,
    DEFAULT_SYNC_CONFIG,
    KillSwitch,
    SyncConfig,
} from "../sync/adminConfig";
import { listTelemetry, SyncTelemetry } from "../sync/telemetry";
import { APP_VERSION, BUILD_HASH, BUILD_TIME } from "../version";
import { computeHealthScore, HealthScoreResult } from "./healthScore";
import { generateInsights, Insight } from "./insightsEngine";

/**
 * Bundles the safe-to-share operational snapshot of this device for
 * support tickets.
 *
 * Deliberately excludes:
 *  - clinical data values
 *  - tokens / cookies / Authorization headers
 *  - full patient payloads
 */
export interface TroubleshootingBundle {
    generatedAt: string;
    app: {
        version: string;
        buildHash: string;
        buildTime: string;
    };
    facility?: {
        id?: string;
        name?: string;
    };
    syncConfig: SyncConfig;
    killSwitch: KillSwitch;
    health: HealthScoreResult;
    insights: Insight[];
    telemetry: SyncTelemetry[];
    pending: {
        trackedEntities: number;
        enrollments: number;
        events: number;
    };
    lastDataPull?: string;
    lastMetadataPull?: string;
    lastDataPush?: string;
    userAgent?: string;
}

export interface BundleInputs {
    syncConfig?: SyncConfig;
    killSwitch?: KillSwitch;
    facility?: { id?: string; name?: string };
    pending: {
        trackedEntities: number;
        enrollments: number;
        events: number;
    };
    lastDataPull?: string;
    lastMetadataPull?: string;
    lastDataPush?: string;
}

export async function buildTroubleshootingBundle(
    input: BundleInputs,
): Promise<TroubleshootingBundle> {
    const telemetry = await listTelemetry().catch(() => []);
    const syncConfig = input.syncConfig ?? DEFAULT_SYNC_CONFIG;
    const killSwitch = input.killSwitch ?? DEFAULT_KILL_SWITCH;
    const health = computeHealthScore({
        telemetry,
        pendingTrackedEntities: input.pending.trackedEntities,
        pendingEnrollments: input.pending.enrollments,
        pendingEvents: input.pending.events,
        lastDataPull: input.lastDataPull,
        lastMetadataPull: input.lastMetadataPull,
    });
    const insights = generateInsights({
        telemetry,
        pendingTrackedEntities: input.pending.trackedEntities,
        pendingEnrollments: input.pending.enrollments,
        pendingEvents: input.pending.events,
        lastDataPull: input.lastDataPull,
        lastMetadataPull: input.lastMetadataPull,
        appVersion: APP_VERSION,
        buildHash: BUILD_HASH,
    });
    return {
        generatedAt: new Date().toISOString(),
        app: {
            version: APP_VERSION,
            buildHash: BUILD_HASH,
            buildTime: BUILD_TIME,
        },
        facility: input.facility,
        syncConfig,
        killSwitch,
        health,
        insights,
        telemetry,
        pending: input.pending,
        lastDataPull: input.lastDataPull,
        lastMetadataPull: input.lastMetadataPull,
        lastDataPush: input.lastDataPush,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    };
}

export function downloadBundleAsJson(bundle: TroubleshootingBundle): void {
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eregisters-bundle-${dayjs(bundle.generatedAt).format(
        "YYYY-MM-DD-HHmm",
    )}-${bundle.app.buildHash}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function downloadBundleAsMarkdown(bundle: TroubleshootingBundle): void {
    const md: string[] = [];
    md.push("# eRegisters troubleshooting bundle");
    md.push("");
    md.push(
        `Generated ${dayjs(bundle.generatedAt).format("MMM D, YYYY · HH:mm")}`,
    );
    md.push(
        `Build ${bundle.app.version} (${bundle.app.buildHash}) — built ${bundle.app.buildTime}`,
    );
    md.push("");
    md.push(`## Health: ${bundle.health.band} (${bundle.health.score}/100)`);
    bundle.health.evidence.forEach((e) =>
        md.push(`- ${e.label} (${e.delta})`),
    );
    md.push("");
    md.push("## Insights");
    if (bundle.insights.length === 0) {
        md.push("- No insights triggered. App appears healthy.");
    } else {
        for (const insight of bundle.insights) {
            md.push(`### ${insight.title} (${insight.severity})`);
            md.push(`**Likely cause:** ${insight.likelyCause}`);
            md.push("**Evidence:**");
            insight.evidence.forEach((e) => md.push(`- ${e}`));
            md.push(`**Recommendation:** ${insight.recommendation}`);
            md.push(
                `**Owner:** ${insight.owner} · **Urgency:** ${insight.urgency} · **Confidence:** ${insight.confidence}`,
            );
            md.push("");
        }
    }
    md.push("## Facility");
    md.push(`- ${bundle.facility?.name ?? "—"} (${bundle.facility?.id ?? "—"})`);
    md.push("");
    md.push("## Sync state");
    md.push(`- Last data pull: ${bundle.lastDataPull ?? "never"}`);
    md.push(`- Last data push: ${bundle.lastDataPush ?? "never"}`);
    md.push(`- Last metadata pull: ${bundle.lastMetadataPull ?? "never"}`);
    md.push(`- Pending tracked entities: ${bundle.pending.trackedEntities}`);
    md.push(`- Pending enrollments: ${bundle.pending.enrollments}`);
    md.push(`- Pending events: ${bundle.pending.events}`);
    md.push("");
    md.push("## Config");
    md.push("```json");
    md.push(JSON.stringify(bundle.syncConfig, null, 2));
    md.push("```");
    md.push("## Kill switch");
    md.push("```json");
    md.push(JSON.stringify(bundle.killSwitch, null, 2));
    md.push("```");

    const blob = new Blob([md.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eregisters-bundle-${dayjs(bundle.generatedAt).format(
        "YYYY-MM-DD-HHmm",
    )}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
