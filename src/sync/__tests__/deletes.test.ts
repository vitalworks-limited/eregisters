import { DELETE_BATCH_SIZE } from "../config";
import { splitDeleteBatches, submitEventDeletes } from "../deletes";
import { FlattenedEvent } from "../../schemas";

function fakeEvent(uid: string): FlattenedEvent {
    return {
        event: uid,
        program: "p",
        programStage: "ps",
        orgUnit: "ou",
        enrollment: "en",
        trackedEntity: "te",
        status: "ACTIVE",
        occurredAt: "2026-06-01T00:00:00.000Z",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        followUp: false,
        deleted: true,
        dataValues: {},
        syncStatus: "deleted",
        lastSynced: "",
        syncError: "",
        version: 1,
    } as any;
}

function fakeReport(uids: string[]) {
    const empty = {
        trackerType: "",
        stats: { created: 0, updated: 0, deleted: uids.length, ignored: 0, total: uids.length },
        objectReports: uids.map((u) => ({
            trackerType: "",
            uid: u,
            errorReports: [],
        })),
    };
    return {
        status: "OK",
        validationReport: { errorReports: [], warningReports: [] },
        stats: { created: 0, updated: 0, deleted: uids.length, ignored: 0, total: uids.length },
        bundleReport: {
            typeReportMap: {
                RELATIONSHIP: { ...empty, objectReports: [] },
                TRACKED_ENTITY: { ...empty, objectReports: [] },
                EVENT: empty,
                ENROLLMENT: { ...empty, objectReports: [] },
            },
        },
    } as any;
}

describe("delete batching", () => {
    test("splitDeleteBatches respects batch size", () => {
        const items = new Array(45).fill(0).map((_, i) => i);
        const batches = splitDeleteBatches(items, 20);
        expect(batches.map((b) => b.length)).toEqual([20, 20, 5]);
    });

    test("default batch size is the configured constant", () => {
        const items = new Array(DELETE_BATCH_SIZE * 2 + 1).fill(0);
        const batches = splitDeleteBatches(items);
        expect(batches[0].length).toBe(DELETE_BATCH_SIZE);
        expect(batches[1].length).toBe(DELETE_BATCH_SIZE);
        expect(batches[2].length).toBe(1);
    });
});

describe("submitEventDeletes", () => {
    test("splits a >batch input into multiple async tracker imports", async () => {
        const allEvents = new Array(45)
            .fill(0)
            .map((_, i) => fakeEvent(`e${i}`));

        // Each batch goes async (well above the 10-item threshold).
        let batchIdx = 0;
        const engine = {
            mutate: jest
                .fn()
                .mockImplementation(async () => ({ response: { id: `J${batchIdx++}` } })),
            query: jest.fn().mockImplementation(async ({ job, report }: any) => {
                if (job) return { job: { status: "COMPLETED" } };
                if (report) {
                    // Return success for all UIDs submitted in the latest call.
                    const lastCall = engine.mutate.mock.calls.at(-1)?.[0];
                    const uids = lastCall.data.events.map((e: any) => e.event);
                    return { report: fakeReport(uids) };
                }
                return {};
            }),
        };

        const result = await submitEventDeletes({
            engine: engine as any,
            deletedEvents: allEvents,
            batchSize: 20,
            delayMs: 0,
        });
        expect(engine.mutate).toHaveBeenCalledTimes(3);
        expect(result.succeeded.size).toBe(45);
        expect(result.failed.size).toBe(0);
        // All deletes used async=true.
        for (const call of engine.mutate.mock.calls) {
            expect(call[0].params.async).toBe(true);
            expect(call[0].params.importStrategy).toBe("DELETE");
        }
    });

    test("skips UIDs already in alreadyPending set", async () => {
        const events = [fakeEvent("a"), fakeEvent("b"), fakeEvent("c")];
        const engine = {
            mutate: jest
                .fn()
                .mockResolvedValue({ response: { id: "JOBX" } }),
            query: jest
                .fn()
                .mockResolvedValueOnce({ job: { status: "COMPLETED" } })
                .mockResolvedValueOnce({ report: fakeReport(["c"]) }),
        };
        const result = await submitEventDeletes({
            engine: engine as any,
            deletedEvents: events,
            alreadyPending: new Set(["a", "b"]),
        });
        const callPayload = engine.mutate.mock.calls[0][0].data.events;
        expect(callPayload).toEqual([{ event: "c" }]);
        expect(result.succeeded.has("c")).toBe(true);
    });

    test("when nothing left after filter, no mutate call is made", async () => {
        const events = [fakeEvent("x")];
        const engine = { mutate: jest.fn(), query: jest.fn() };
        const result = await submitEventDeletes({
            engine: engine as any,
            deletedEvents: events,
            alreadyPending: new Set(["x"]),
        });
        expect(engine.mutate).not.toHaveBeenCalled();
        expect(result.succeeded.size).toBe(0);
        expect(result.failed.size).toBe(0);
    });
});
