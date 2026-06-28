import {
    _resetUpdateChecker,
    startUpdatePolling,
    stopUpdatePolling,
} from "../updateChecker";
import { isSyncBlockedByUpdate, withUpdateGuard } from "../syncGuard";

function jsonResponse(body: unknown): Response {
    return {
        ok: true,
        status: 200,
        json: async () => body,
        headers: new Headers(),
    } as unknown as Response;
}

describe("syncGuard", () => {
    beforeEach(() => {
        _resetUpdateChecker();
    });
    afterEach(() => {
        stopUpdatePolling();
    });

    test("does not block when no update is detected", () => {
        const onBlocked = jest.fn();
        expect(isSyncBlockedByUpdate({ onBlocked })).toBe(false);
        expect(onBlocked).not.toHaveBeenCalled();
    });

    test("blocks heavy sync once update detected", async () => {
        const fetchImpl = jest
            .fn()
            .mockResolvedValue(
                jsonResponse({ buildHash: "new", version: "1", app: "x", buildTime: "" }),
            );
        startUpdatePolling({
            fetchImpl: fetchImpl as unknown as typeof fetch,
            currentBuildHash: "old",
            pollIntervalMs: 60_000,
        });
        await new Promise((r) => setTimeout(r, 25));

        const onBlocked = jest.fn();
        expect(isSyncBlockedByUpdate({ onBlocked })).toBe(true);
        expect(onBlocked).toHaveBeenCalled();
    });

    test("withUpdateGuard short-circuits work when blocked", async () => {
        const fetchImpl = jest
            .fn()
            .mockResolvedValue(
                jsonResponse({ buildHash: "new", version: "1", app: "x", buildTime: "" }),
            );
        startUpdatePolling({
            fetchImpl: fetchImpl as unknown as typeof fetch,
            currentBuildHash: "old",
            pollIntervalMs: 60_000,
        });
        await new Promise((r) => setTimeout(r, 25));

        const work = jest.fn(async () => 42);
        const guarded = withUpdateGuard(work);
        const result = await guarded();
        expect(result).toBeUndefined();
        expect(work).not.toHaveBeenCalled();
    });

    test("withUpdateGuard runs work when not blocked", async () => {
        const work = jest.fn(async () => 7);
        const guarded = withUpdateGuard(work);
        const result = await guarded();
        expect(result).toBe(7);
        expect(work).toHaveBeenCalled();
    });
});
