import {
    _resetUpdateChecker,
    checkForAppUpdate,
    isUpdateAvailable,
    onUpdateAvailable,
    startUpdatePolling,
    stopUpdatePolling,
} from "../updateChecker";

function jsonResponse(body: unknown): Response {
    return {
        ok: true,
        status: 200,
        json: async () => body,
        headers: new Headers(),
    } as unknown as Response;
}

describe("updateChecker", () => {
    beforeEach(() => {
        _resetUpdateChecker();
    });
    afterEach(() => {
        stopUpdatePolling();
    });

    test("uses cache: 'no-store' and a timestamp cache buster", async () => {
        const fetchImpl = jest
            .fn<Promise<Response>, [string, RequestInit]>()
            .mockResolvedValue(jsonResponse({ buildHash: "same" }));

        await checkForAppUpdate({
            fetchImpl: fetchImpl as unknown as typeof fetch,
            currentBuildHash: "same",
        });

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toMatch(/^version\.json\?t=\d+/);
        expect(init.cache).toBe("no-store");
        expect((init.headers as Record<string, string>)["Cache-Control"]).toBe(
            "no-cache",
        );
    });

    test("returns undefined when buildHash matches current", async () => {
        const fetchImpl = jest
            .fn()
            .mockResolvedValue(jsonResponse({ buildHash: "abc" }));
        const result = await checkForAppUpdate({
            fetchImpl: fetchImpl as unknown as typeof fetch,
            currentBuildHash: "abc",
        });
        expect(result).toBeUndefined();
    });

    test("returns remote info when buildHash differs", async () => {
        const fetchImpl = jest.fn().mockResolvedValue(
            jsonResponse({
                app: "eregisters",
                version: "1.1.5",
                buildHash: "new",
                buildTime: "2026-06-26T10:00:00Z",
            }),
        );
        const result = await checkForAppUpdate({
            fetchImpl: fetchImpl as unknown as typeof fetch,
            currentBuildHash: "old",
        });
        expect(result?.buildHash).toBe("new");
    });

    test("returns undefined on network/parse errors", async () => {
        const fetchImpl = jest.fn().mockRejectedValue(new Error("network"));
        const result = await checkForAppUpdate({
            fetchImpl: fetchImpl as unknown as typeof fetch,
            currentBuildHash: "old",
        });
        expect(result).toBeUndefined();
    });

    test("startUpdatePolling triggers listener once buildHash changes", async () => {
        const fetchImpl = jest.fn().mockResolvedValue(
            jsonResponse({
                app: "eregisters",
                version: "1.1.5",
                buildHash: "new",
                buildTime: "2026-06-26T10:00:00Z",
            }),
        );
        const listener = jest.fn();
        onUpdateAvailable(listener);

        startUpdatePolling({
            fetchImpl: fetchImpl as unknown as typeof fetch,
            currentBuildHash: "old",
            pollIntervalMs: 60_000,
        });

        await new Promise((r) => setTimeout(r, 25));

        expect(listener).toHaveBeenCalledWith(
            expect.objectContaining({ buildHash: "new" }),
        );
        expect(isUpdateAvailable()).toBe(true);
    });

    test("listener registered after detection fires immediately", async () => {
        const fetchImpl = jest.fn().mockResolvedValue(
            jsonResponse({ buildHash: "new", version: "1.1.5", app: "x", buildTime: "" }),
        );
        startUpdatePolling({
            fetchImpl: fetchImpl as unknown as typeof fetch,
            currentBuildHash: "old",
            pollIntervalMs: 60_000,
        });
        await new Promise((r) => setTimeout(r, 25));

        const late = jest.fn();
        onUpdateAvailable(late);
        expect(late).toHaveBeenCalled();
    });
});
