import type { useDataEngine } from "@dhis2/app-runtime";
import { Dhis2Report, FlattenedEvent } from "../schemas";
import {
    DELETE_BATCH_DELAY_MS,
    DELETE_BATCH_SIZE,
} from "./config";
import {
    submitTrackerImportAndAwaitReport,
} from "./trackerImport";

/**
 * Bulk delete helper.
 *
 * Why: production logs showed >5,000 synchronous DELETE imports in a
 * 3-hour window. Each held a Tomcat thread. We must:
 *   1. Batch deletes (don't submit one-by-one).
 *   2. Throttle between batches.
 *   3. Use async tracker import for bulk deletes.
 *   4. Skip events that are already pending/submitted.
 */

type Engine = ReturnType<typeof useDataEngine>;

export interface PendingDelete {
    uid: string;
    type: "event" | "trackedEntity" | "enrollment";
    firstQueuedAt: string;
    lastAttemptAt?: string;
    status: "pending" | "submitted" | "confirmed" | "failed";
    attempts: number;
    lastError?: string;
}

export function splitDeleteBatches<T>(
    items: T[],
    batchSize: number = DELETE_BATCH_SIZE,
): T[][] {
    if (batchSize <= 0) return [items];
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
    }
    return batches;
}

const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface DeleteResult {
    succeeded: Set<string>;
    failed: Map<string, string>;
}

/**
 * Submit a list of event deletes in batches.
 *
 * Skips any UID listed in `alreadyPending`. Uses async tracker import
 * for batches that exceed the bulk threshold (the helper inside
 * `submitTrackerImportAndAwaitReport` makes that decision).
 */
export async function submitEventDeletes({
    engine,
    deletedEvents,
    alreadyPending,
    batchSize = DELETE_BATCH_SIZE,
    delayMs = DELETE_BATCH_DELAY_MS,
}: {
    engine: Engine;
    deletedEvents: FlattenedEvent[];
    alreadyPending?: Set<string>;
    batchSize?: number;
    delayMs?: number;
}): Promise<DeleteResult> {
    const succeeded = new Set<string>();
    const failed = new Map<string, string>();

    const toSubmit = alreadyPending
        ? deletedEvents.filter((e) => !alreadyPending.has(e.event))
        : deletedEvents;

    if (toSubmit.length === 0) {
        return { succeeded, failed };
    }

    const batches = splitDeleteBatches(toSubmit, batchSize);

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const report = await submitTrackerImportAndAwaitReport({
            engine,
            data: { events: batch.map((e) => ({ event: e.event })) },
            params: {
                importStrategy: "DELETE",
                atomicMode: "OBJECT",
                reportMode: "ERRORS",
            },
            background: true,
        });

        if (report) {
            collectReportOutcome(report, succeeded, failed);
        } else {
            // Async job did not finish in poll window — treat as pending
            // (caller can re-poll via the pending job store). Leave UIDs
            // out of succeeded/failed for now so they are not lost.
        }

        if (i < batches.length - 1 && delayMs > 0) {
            await sleep(delayMs);
        }
    }

    return { succeeded, failed };
}

function collectReportOutcome(
    report: Dhis2Report,
    succeeded: Set<string>,
    failed: Map<string, string>,
) {
    for (const r of report.bundleReport.typeReportMap.EVENT.objectReports) {
        succeeded.add(r.uid);
    }
    for (const err of report.validationReport.errorReports) {
        succeeded.delete(err.uid);
        failed.set(err.uid, err.message);
    }
}
