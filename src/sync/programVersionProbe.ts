import { useDataEngine } from "@dhis2/app-runtime";

/**
 * Cheap pre-sync probe used on app load to decide whether the metadata
 * cache is up to date.
 *
 * DHIS2 programs carry a monotonically incrementing `version` integer
 * that bumps whenever any structural change is saved upstream (program,
 * stages, sections, attributes, program rules). Fetching only that one
 * field is ~200 bytes and is the same signal the official tracker apps
 * use to gate their metadata refresh.
 *
 * Returns `undefined` on any failure (offline, 4xx, malformed response).
 * Callers MUST treat undefined as "do not have a verdict" and fall back
 * to the existing time-based rules — never as "no update available".
 */

type Engine = ReturnType<typeof useDataEngine>;

export interface RemoteProgramSummary {
    version: number;
    lastUpdated: string;
}

export async function probeProgramVersion(
    engine: Engine,
    programId: string,
): Promise<RemoteProgramSummary | undefined> {
    try {
        const result = (await engine.query({
            program: {
                resource: `programs/${programId}`,
                params: {
                    fields: "version,lastUpdated",
                },
            },
        })) as {
            program?: { version?: number; lastUpdated?: string };
        };
        const v = result.program?.version;
        const lu = result.program?.lastUpdated;
        if (typeof v !== "number" || typeof lu !== "string") {
            return undefined;
        }
        return { version: v, lastUpdated: lu };
    } catch {
        return undefined;
    }
}
