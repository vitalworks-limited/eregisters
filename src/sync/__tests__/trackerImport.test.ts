import { BULK_IMPORT_THRESHOLD } from "../config";
import {
    countTrackerItems,
    extractTrackerJobId,
    isTrackerJobComplete,
    pollTrackerJobReport,
    shouldUseAsyncImport,
    submitTrackerImport,
    submitTrackerImportAndAwaitReport,
} from "../trackerImport";

function fakeReport() {
    const empty = {
        trackerType: "",
        stats: { created: 1, updated: 0, deleted: 0, ignored: 0, total: 1 },
        objectReports: [{ trackerType: "", uid: "u1", errorReports: [] }],
    };
    return {
        status: "OK",
        validationReport: { errorReports: [], warningReports: [] },
        stats: { created: 1, updated: 0, deleted: 0, ignored: 0, total: 1 },
        bundleReport: {
            typeReportMap: {
                RELATIONSHIP: { ...empty, objectReports: [] },
                TRACKED_ENTITY: empty,
                EVENT: empty,
                ENROLLMENT: empty,
            },
        },
    } as any;
}

describe("tracker import async/sync decision", () => {
    test("bulk push (background=true) uses async=true", () => {
        expect(
            shouldUseAsyncImport({
                payload: { events: [{ event: "a" }] },
                background: true,
            }),
        ).toBe(true);
    });

    test("forceSync overrides background", () => {
        expect(
            shouldUseAsyncImport({
                payload: { events: new Array(50).fill({ event: "x" }) },
                background: true,
                forceSync: true,
            }),
        ).toBe(false);
    });

    test(`payload above threshold (${BULK_IMPORT_THRESHOLD}) uses async`, () => {
        const payload = {
            events: new Array(BULK_IMPORT_THRESHOLD + 1).fill({ event: "x" }),
        };
        expect(shouldUseAsyncImport({ payload })).toBe(true);
    });

    test("payload at or below threshold may stay sync", () => {
        const payload = {
            events: new Array(BULK_IMPORT_THRESHOLD).fill({ event: "x" }),
        };
        expect(shouldUseAsyncImport({ payload })).toBe(false);
    });

    test("counts items across trackedEntities, enrollments, events", () => {
        expect(
            countTrackerItems({
                trackedEntities: [{}, {}] as any,
                enrollments: [{}] as any,
                events: [{}, {}, {}] as any,
            }),
        ).toBe(6);
    });
});

describe("tracker job id extraction", () => {
    test("reads top-level id", () => {
        expect(extractTrackerJobId({ id: "job123" })).toBe("job123");
    });
    test("reads nested response.id", () => {
        expect(extractTrackerJobId({ response: { id: "abc" } })).toBe("abc");
    });
    test("reads id from location url", () => {
        expect(
            extractTrackerJobId({
                response: { location: "/api/tracker/jobs/JOBXYZ" },
            }),
        ).toBe("JOBXYZ");
    });
    test("throws when no id", () => {
        expect(() => extractTrackerJobId({})).toThrow();
    });
});

describe("submitTrackerImport", () => {
    test("sync path returns the inline report", async () => {
        const engine = { mutate: jest.fn().mockResolvedValue(fakeReport()) };
        const out = await submitTrackerImport({
            engine: engine as any,
            data: { events: [{ event: "e1" }] },
            params: { importStrategy: "CREATE_AND_UPDATE" },
            async: false,
        });
        expect(out.report?.status).toBe("OK");
        expect(out.jobId).toBeUndefined();
        const call = engine.mutate.mock.calls[0][0];
        expect(call.params.async).toBe(false);
    });

    test("async path returns the job id", async () => {
        const engine = {
            mutate: jest.fn().mockResolvedValue({ response: { id: "JJ" } }),
        };
        const out = await submitTrackerImport({
            engine: engine as any,
            data: { events: [{ event: "e1" }] },
            params: { importStrategy: "CREATE_AND_UPDATE" },
            async: true,
        });
        expect(out.jobId).toBe("JJ");
        expect(out.report).toBeUndefined();
        const call = engine.mutate.mock.calls[0][0];
        expect(call.params.async).toBe(true);
    });
});

describe("pollTrackerJobReport", () => {
    test("polls until status COMPLETED then fetches report", async () => {
        let polls = 0;
        const engine = {
            query: jest
                .fn()
                .mockImplementation(async ({ job, report }: any) => {
                    if (job) {
                        polls += 1;
                        if (polls < 2) return { job: { status: "RUNNING" } };
                        return { job: { status: "COMPLETED" } };
                    }
                    if (report) return { report: fakeReport() };
                }),
        };
        const result = await pollTrackerJobReport({
            engine: engine as any,
            jobId: "J1",
            pollIntervalMs: 1,
            timeoutMs: 5_000,
        });
        expect(result?.status).toBe("OK");
        expect(polls).toBeGreaterThanOrEqual(2);
    });

    test("isTrackerJobComplete recognises various job log shapes", () => {
        expect(isTrackerJobComplete({ completed: true })).toBe(true);
        expect(isTrackerJobComplete([{ status: "COMPLETED" }])).toBe(true);
        expect(isTrackerJobComplete({ jobStatus: "SUCCESS" })).toBe(true);
        expect(isTrackerJobComplete({ status: "RUNNING" })).toBe(false);
    });
});

describe("submitTrackerImportAndAwaitReport", () => {
    test("background bulk push goes async and polls", async () => {
        let mutated = false;
        const engine = {
            mutate: jest.fn().mockImplementation(async () => {
                mutated = true;
                return { response: { id: "J1" } };
            }),
            query: jest
                .fn()
                .mockResolvedValueOnce({ job: { status: "COMPLETED" } })
                .mockResolvedValueOnce({ report: fakeReport() }),
        };
        const data = {
            events: new Array(BULK_IMPORT_THRESHOLD + 5).fill({ event: "x" }),
        };
        const result = await submitTrackerImportAndAwaitReport({
            engine: engine as any,
            data,
            params: { importStrategy: "CREATE_AND_UPDATE" },
            background: true,
            pollIntervalMs: 1,
            timeoutMs: 5_000,
        });
        expect(mutated).toBe(true);
        expect(engine.mutate.mock.calls[0][0].params.async).toBe(true);
        expect(result?.status).toBe("OK");
    });

    test("small synchronous save with forceSync stays sync", async () => {
        const engine = {
            mutate: jest.fn().mockResolvedValue(fakeReport()),
            query: jest.fn(),
        };
        const result = await submitTrackerImportAndAwaitReport({
            engine: engine as any,
            data: { events: [{ event: "x" }] },
            params: { importStrategy: "CREATE_AND_UPDATE" },
            forceSync: true,
        });
        expect(result?.status).toBe("OK");
        expect(engine.mutate.mock.calls[0][0].params.async).toBe(false);
    });
});
