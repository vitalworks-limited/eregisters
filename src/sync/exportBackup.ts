import {
    enrollmentsCollection,
    eventsCollection,
    trackedEntitiesCollection,
} from "../collections";
import { APP_VERSION, BUILD_HASH } from "../version";

interface BackupBundle {
    schemaVersion: 1;
    exportedAt: string;
    appVersion: string;
    buildHash: string;
    counts: {
        trackedEntities: number;
        enrollments: number;
        events: number;
        pendingTrackedEntities: number;
        pendingEnrollments: number;
        pendingEvents: number;
    };
    records: {
        trackedEntities: unknown[];
        enrollments: unknown[];
        events: unknown[];
    };
}

async function readAll<T>(
    collection: {
        utils: {
            getTable: () => {
                toArray: () => Promise<T[]>;
            };
        };
    },
): Promise<T[]> {
    return collection.utils.getTable().toArray();
}

export async function buildBackupBundle(): Promise<BackupBundle> {
    const [trackedEntities, enrollments, events] = await Promise.all([
        readAll<{ syncStatus?: string }>(
            trackedEntitiesCollection as unknown as Parameters<
                typeof readAll
            >[0],
        ),
        readAll<{ syncStatus?: string }>(
            enrollmentsCollection as unknown as Parameters<typeof readAll>[0],
        ),
        readAll<{ syncStatus?: string }>(
            eventsCollection as unknown as Parameters<typeof readAll>[0],
        ),
    ]);
    const countPending = (list: Array<{ syncStatus?: string }>) =>
        list.filter((x) => x.syncStatus === "pending").length;
    return {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        appVersion: APP_VERSION,
        buildHash: BUILD_HASH,
        counts: {
            trackedEntities: trackedEntities.length,
            enrollments: enrollments.length,
            events: events.length,
            pendingTrackedEntities: countPending(trackedEntities),
            pendingEnrollments: countPending(enrollments),
            pendingEvents: countPending(events),
        },
        records: {
            trackedEntities,
            enrollments,
            events,
        },
    };
}

export async function downloadBackupBundle(): Promise<BackupBundle> {
    const bundle = await buildBackupBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = bundle.exportedAt.replace(/[:.]/g, "-");
    a.href = url;
    a.download = `eregisters-backup-${bundle.appVersion}-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return bundle;
}
