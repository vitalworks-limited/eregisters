import { useDataEngine } from "@dhis2/app-runtime";
import { useEffect, useState } from "react";

/**
 * Count + sample of tracked entities matching the user's search on the
 * server but not yet on this device. The query is debounced and only
 * fires when the user has typed something, the device is online, and
 * the caller passes a program + org unit.
 *
 * Why a separate hook: the regular patient list searches the local
 * Dexie cache only — fast and offline-safe. After a brief debounce
 * this hook also asks the server "do you have anyone else matching?"
 * so users on freshly-installed or partially-synced devices can find
 * patients before having to do a full pull. Uses a small page size +
 * `totalPages=true` so the request is cheap.
 */
export interface ServerSearchHit {
    trackedEntity: string;
    orgUnit: string;
    attributes: Record<string, string>;
}

export interface ServerSearchResult {
    total: number;
    sample: ServerSearchHit[];
    loading: boolean;
    error?: string;
}

const DEBOUNCE_MS = 500;
const SAMPLE_PAGE_SIZE = 5;

interface ProbeRow {
    trackedEntity: string;
    orgUnit: string;
    attributes?: Array<{ attribute: string; value?: string }>;
}

interface ProbeResponse {
    list: {
        instances?: ProbeRow[];
        trackedEntities?: ProbeRow[];
        page?: { total?: number };
        pager?: { total?: number };
    };
}

function rowsFromResponse(payload: ProbeResponse["list"]): ProbeRow[] {
    return payload?.instances ?? payload?.trackedEntities ?? [];
}

function totalFromResponse(payload: ProbeResponse["list"]): number {
    return payload?.pager?.total ?? payload?.page?.total ?? 0;
}

export function useOnlineSearchCount({
    program,
    orgUnit,
    query,
    online,
    enabled = true,
}: {
    program: string | undefined;
    orgUnit: string | undefined;
    query: string;
    online: boolean;
    enabled?: boolean;
}): ServerSearchResult {
    const engine = useDataEngine();
    const trimmed = query.trim();
    const [state, setState] = useState<ServerSearchResult>({
        total: 0,
        sample: [],
        loading: false,
    });

    useEffect(() => {
        if (!enabled || !online || !program || !orgUnit || trimmed.length < 2) {
            setState({ total: 0, sample: [], loading: false });
            return;
        }
        let cancelled = false;
        setState((s) => ({ ...s, loading: true, error: undefined }));
        const timer = setTimeout(async () => {
            try {
                const r = (await engine.query({
                    list: {
                        resource: "tracker/trackedEntities",
                        params: {
                            program,
                            orgUnit,
                            ouMode: "ACCESSIBLE",
                            query: trimmed,
                            pageSize: SAMPLE_PAGE_SIZE,
                            totalPages: true,
                            fields: "trackedEntity,orgUnit,attributes[attribute,value]",
                        },
                    },
                })) as unknown as ProbeResponse;
                if (cancelled) return;
                const list = r.list;
                const rows = rowsFromResponse(list);
                const total = totalFromResponse(list) || rows.length;
                setState({
                    total,
                    sample: rows.map((row) => ({
                        trackedEntity: row.trackedEntity,
                        orgUnit: row.orgUnit,
                        attributes: Object.fromEntries(
                            (row.attributes ?? []).map((a) => [
                                a.attribute,
                                a.value ?? "",
                            ]),
                        ),
                    })),
                    loading: false,
                });
            } catch (err) {
                if (cancelled) return;
                setState({
                    total: 0,
                    sample: [],
                    loading: false,
                    error:
                        err instanceof Error ? err.message : String(err),
                });
            }
        }, DEBOUNCE_MS);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [engine, program, orgUnit, trimmed, online, enabled]);

    return state;
}
