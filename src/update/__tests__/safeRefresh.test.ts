import {
    SAFE_REFRESH_MESSAGE,
    UNSAVED_DATA_MESSAGE,
    cleanAppShellCaches,
    startSafeRefreshFlow,
} from "../safeRefresh";
import { VersionInfo } from "../../version";

const remote: VersionInfo = {
    app: "eregisters",
    version: "1.1.5",
    buildHash: "new",
    buildTime: "2026-06-26T10:00:00Z",
};

describe("startSafeRefreshFlow", () => {
    test("auto-refreshes when there is no unsaved data", async () => {
        const reload = jest.fn();
        const notify = jest.fn();
        const cleanCaches = jest.fn();
        const result = await startSafeRefreshFlow(remote, {
            reload,
            notify,
            notifyBlocking: jest.fn(),
            cleanCaches,
            hasUnsavedData: () => false,
        });
        expect(notify).toHaveBeenCalledWith(SAFE_REFRESH_MESSAGE);
        expect(cleanCaches).toHaveBeenCalled();
        expect(reload).toHaveBeenCalled();
        expect(result.reloaded).toBe(true);
        expect(result.deferredForUnsavedData).toBe(false);
    });

    test("defers refresh when unsaved data exists and cannot be drafted", async () => {
        const reload = jest.fn();
        const notifyBlocking = jest.fn();
        const result = await startSafeRefreshFlow(remote, {
            reload,
            notify: jest.fn(),
            notifyBlocking,
            hasUnsavedData: () => true,
            saveDraftIfPossible: () => false,
        });
        expect(notifyBlocking).toHaveBeenCalledWith(UNSAVED_DATA_MESSAGE);
        expect(reload).not.toHaveBeenCalled();
        expect(result.reloaded).toBe(false);
        expect(result.deferredForUnsavedData).toBe(true);
    });

    test("proceeds when unsaved data can be drafted", async () => {
        const reload = jest.fn();
        const saveDraftIfPossible = jest.fn(() => true);
        const result = await startSafeRefreshFlow(remote, {
            reload,
            notify: jest.fn(),
            notifyBlocking: jest.fn(),
            hasUnsavedData: () => true,
            saveDraftIfPossible,
        });
        expect(saveDraftIfPossible).toHaveBeenCalled();
        expect(reload).toHaveBeenCalled();
        expect(result.reloaded).toBe(true);
    });

    test("cleanAppShellCaches preserves clinical/offline caches", async () => {
        const deleted: string[] = [];
        const fakeCaches = {
            keys: async () => [
                "app-shell-v1",
                "static-assets",
                "clinical-records",
                "offline-data",
                "section-medical-registers",
                "vendor-bundle",
            ],
            delete: async (key: string) => {
                deleted.push(key);
                return true;
            },
        };
        (globalThis as Record<string, unknown>).caches = fakeCaches as unknown;
        try {
            await cleanAppShellCaches();
        } finally {
            delete (globalThis as Record<string, unknown>).caches;
        }
        expect(deleted).toEqual(
            expect.arrayContaining([
                "app-shell-v1",
                "static-assets",
                "vendor-bundle",
            ]),
        );
        expect(deleted).not.toContain("clinical-records");
        expect(deleted).not.toContain("offline-data");
        expect(deleted).not.toContain("section-medical-registers");
    });
});
