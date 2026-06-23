export type MetadataSyncMode = "full" | "incremental";
export type DataPullMode = "full" | "incremental";
export type DataPushMode = "direct" | "batch";

export function shouldUseLastUpdatedFilter(
    mode: MetadataSyncMode,
    lastMetadataPull: string | undefined,
) {
    return mode === "incremental" && lastMetadataPull !== undefined;
}

export function isMetadataSyncLoading(
    isMetadataSyncActive: boolean,
    _lastMetadataPull: string | undefined,
) {
    return isMetadataSyncActive;
}

export function shouldUseLastDataPull(
    mode: DataPullMode,
    lastDataPull: string | undefined,
) {
    return mode === "incremental" && lastDataPull !== undefined;
}

export function isDataPullLoading(
    isDataPullActive: boolean,
    _lastDataPull: string | undefined,
) {
    return isDataPullActive;
}

export function isDataPushLoading(isDataPushActive: boolean) {
    return isDataPushActive;
}

export function shouldRecordDataPush({ processed }: { processed: number }) {
    return processed > 0;
}

function extractTrackerJobId(response: unknown) {
    const value = response as {
        id?: string;
        location?: string;
        response?: {
            id?: string;
            location?: string;
        };
    };
    const id = value.response?.id ?? value.id;
    if (id) {
        return id;
    }

    const location = value.response?.location ?? value.location;
    const match = location?.match(/\/tracker\/jobs\/([^/?#]+)/);
    if (match?.[1]) {
        return match[1];
    }

    throw new Error("DHIS2 tracker async response did not include a job id");
}

function isTrackerJobComplete(jobLogs: unknown) {
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

export function shouldContinueDataPull({
    receivedCount,
    pageSize,
    pager,
}: {
    receivedCount: number;
    pageSize: number;
    pager?: {
        page?: number;
        pageSize?: number;
        pageCount?: number;
        total?: number;
        nextPage?: string;
    };
}) {
    if (receivedCount === 0) {
        return false;
    }

    if (pager) {
        if (pager.page !== undefined && pager.pageCount !== undefined) {
            return pager.page < pager.pageCount;
        }
        if (pager.total !== undefined && pager.page !== undefined) {
            const effectivePageSize = pager.pageSize ?? pageSize;
            return pager.page * effectivePageSize < pager.total;
        }
        return pager.nextPage !== undefined;
    }

    return receivedCount === pageSize;
}
