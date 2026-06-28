import type { useDataEngine } from "@dhis2/app-runtime";
import { Dhis2Report } from "../schemas";
import {
    BULK_IMPORT_THRESHOLD,
    TRACKER_JOB_POLL_INTERVAL_MS,
    TRACKER_JOB_POLL_TIMEOUT_MS,
} from "./config";

/**
 * Tracker import helpers.
 *
 * Why: production showed thousands of synchronous tracker imports
 * (`async=false`) tying up Tomcat/DHIS2 threads. Bulk background pushes
 * must use async=true and poll the job report.
 */

type Engine = ReturnType<typeof useDataEngine>;

export interface TrackerImportPayload {
    trackedEntities?: any[];
    enrollments?: any[];
    events?: any[];
}

/** Count of top-level items in a tracker payload. */
export function countTrackerItems(payload: TrackerImportPayload): number {
    return (
        (payload.trackedEntities?.length ?? 0) +
        (payload.enrollments?.length ?? 0) +
        (payload.events?.length ?? 0)
    );
}

/**
 * Returns true if the payload should be submitted as an async tracker job.
 *
 * Pass `forceSync: true` for small immediate clinical saves that need
 * inline validation. The default policy is "go async once we cross the
 * bulk threshold or whenever the caller is doing a background sync".
 */
export function shouldUseAsyncImport(args: {
    payload: TrackerImportPayload;
    background?: boolean;
    forceSync?: boolean;
    threshold?: number;
}): boolean {
    if (args.forceSync) return false;
    if (args.background) return true;
    const threshold = args.threshold ?? BULK_IMPORT_THRESHOLD;
    return countTrackerItems(args.payload) > threshold;
}

export function extractTrackerJobId(response: unknown): string {
    const value = response as {
        id?: string;
        location?: string;
        response?: { id?: string; location?: string };
    };
    const id = value.response?.id ?? value.id;
    if (id) return id;
    const location = value.response?.location ?? value.location;
    const match = location?.match(/\/tracker\/jobs\/([^/?#]+)/);
    if (match?.[1]) return match[1];
    throw new Error("DHIS2 tracker async response did not include a job id");
}

export function isTrackerJobComplete(jobLogs: unknown): boolean {
    const logs = Array.isArray(jobLogs) ? jobLogs : [jobLogs];
    return logs.some((log) => {
        const value = log as {
            completed?: boolean;
            jobStatus?: string;
            status?: string;
            message?: string;
        };
        const status = value.status ?? value.jobStatus;
        return (
            value.completed === true ||
            status === "COMPLETED" ||
            status === "SUCCESS" ||
            value.message?.toLowerCase().includes("import complete") === true
        );
    });
}

const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface SyncImportParams {
    importStrategy?: "CREATE_AND_UPDATE" | "UPDATE" | "DELETE";
    atomicMode?: "OBJECT" | "ALL";
    skipPatternValidation?: boolean | string;
    skipSideEffects?: boolean | string;
    reportMode?: "ERRORS" | "WARNINGS" | "FULL";
}

/** Persistence backend for pending tracker job resume. */
export interface PendingJobStore {
    save(job: PendingTrackerJob): Promise<void>;
    remove(jobId: string): Promise<void>;
    list(): Promise<PendingTrackerJob[]>;
}

export interface PendingTrackerJob {
    jobId: string;
    submittedAt: string;
    description?: string;
}

let activePendingJobStore: PendingJobStore | undefined;
export function setPendingJobStore(store: PendingJobStore | undefined) {
    activePendingJobStore = store;
}

export async function submitTrackerImport({
    engine,
    data,
    params,
    async: useAsync,
}: {
    engine: Engine;
    data: TrackerImportPayload;
    params: SyncImportParams;
    async: boolean;
}): Promise<{
    jobId?: string;
    report?: Dhis2Report;
}> {
    const response = (await engine.mutate({
        resource: "tracker",
        type: "create",
        data,
        params: {
            ...params,
            async: useAsync,
        },
    })) as unknown;

    if (!useAsync) {
        return { report: response as Dhis2Report };
    }

    const jobId = extractTrackerJobId(response);
    if (activePendingJobStore) {
        await activePendingJobStore
            .save({
                jobId,
                submittedAt: new Date().toISOString(),
            })
            .catch(() => undefined);
    }
    return { jobId };
}

/**
 * Poll a tracker async job until it completes (or until timeout).
 *
 * Returns the final report or undefined if the job did not finish in time
 * (caller can choose to re-poll later — the job id is stored in the
 * pending-job store if one was registered).
 */
export async function pollTrackerJobReport({
    engine,
    jobId,
    pollIntervalMs = TRACKER_JOB_POLL_INTERVAL_MS,
    timeoutMs = TRACKER_JOB_POLL_TIMEOUT_MS,
}: {
    engine: Engine;
    jobId: string;
    pollIntervalMs?: number;
    timeoutMs?: number;
}): Promise<Dhis2Report | undefined> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        try {
            const jobResponse = (await engine.query({
                job: {
                    resource: `tracker/jobs/${jobId}`,
                },
            })) as { job: unknown };

            if (isTrackerJobComplete(jobResponse.job)) {
                const reportResponse = (await engine.query({
                    report: {
                        resource: `tracker/jobs/${jobId}/report`,
                        params: { reportMode: "FULL" },
                    },
                })) as { report: Dhis2Report };
                if (activePendingJobStore) {
                    await activePendingJobStore
                        .remove(jobId)
                        .catch(() => undefined);
                }
                return reportResponse.report;
            }
        } catch {
            // Continue polling; the job may not be queryable yet.
        }
        await sleep(pollIntervalMs);
    }
    return undefined;
}

/**
 * One-shot submission. Picks sync vs async based on payload size / caller
 * intent. Returns the report once available; if async and polling times
 * out, returns undefined and leaves the job in the pending store.
 */
export async function submitTrackerImportAndAwaitReport(args: {
    engine: Engine;
    data: TrackerImportPayload;
    params: SyncImportParams;
    background?: boolean;
    forceSync?: boolean;
    threshold?: number;
    pollIntervalMs?: number;
    timeoutMs?: number;
}): Promise<Dhis2Report | undefined> {
    const useAsync = shouldUseAsyncImport({
        payload: args.data,
        background: args.background,
        forceSync: args.forceSync,
        threshold: args.threshold,
    });

    const submitted = await submitTrackerImport({
        engine: args.engine,
        data: args.data,
        params: args.params,
        async: useAsync,
    });

    if (submitted.report) {
        return submitted.report;
    }

    if (submitted.jobId) {
        return pollTrackerJobReport({
            engine: args.engine,
            jobId: submitted.jobId,
            pollIntervalMs: args.pollIntervalMs,
            timeoutMs: args.timeoutMs,
        });
    }

    return undefined;
}

/**
 * Empty Dhis2 report used when an async job did not finish in time and
 * a fall-through return value is needed.
 */
export function emptyTrackerReport(): Dhis2Report {
    const emptyTypeReport = {
        trackerType: "",
        stats: { created: 0, updated: 0, deleted: 0, ignored: 0, total: 0 },
        objectReports: [],
    };
    return {
        status: "PENDING",
        validationReport: { errorReports: [], warningReports: [] },
        stats: { created: 0, updated: 0, deleted: 0, ignored: 0, total: 0 },
        bundleReport: {
            typeReportMap: {
                RELATIONSHIP: emptyTypeReport,
                TRACKED_ENTITY: emptyTypeReport,
                EVENT: emptyTypeReport,
                ENROLLMENT: emptyTypeReport,
            },
        },
    } as Dhis2Report;
}
