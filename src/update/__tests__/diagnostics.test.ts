import { APP_VERSION, BUILD_HASH, BUILD_TIME } from "../../version";
import {
    downloadSyncDiagnostics,
    SyncTelemetryBuilder,
} from "../../sync/telemetry";

describe("diagnostics include build identity", () => {
    test("telemetry records include appVersion", () => {
        const builder = new SyncTelemetryBuilder("data-pull", {
            orgUnitUid: "ou",
        });
        const snapshot = builder.snapshot();
        expect(snapshot.appVersion).toBe(APP_VERSION);
    });

    test("downloadSyncDiagnostics blob carries version/buildHash/buildTime", async () => {
        // listTelemetry handles missing IndexedDB gracefully (returns []),
        // so this test does not require a Dexie backend to verify the
        // diagnostics envelope.
        const blob = await downloadSyncDiagnostics();
        // jsdom's Blob has no .text(); read via FileReader.
        const text = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => reject(reader.error);
            reader.readAsText(blob);
        });
        const parsed = JSON.parse(text);
        expect(parsed.appVersion).toBe(APP_VERSION);
        expect(parsed.buildHash).toBe(BUILD_HASH);
        expect(parsed.buildTime).toBe(BUILD_TIME);
        expect(parsed.records).toBeInstanceOf(Array);
    });
});
