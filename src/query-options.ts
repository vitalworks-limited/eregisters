import { useDataEngine } from "@dhis2/app-runtime";
import { QueryKey, queryOptions } from "@tanstack/react-query";

export const resourceQueryOptions = <T>({
    engine,
    resource,
    params,
    id,
    queryKey,
    refetchInterval,
}: {
    engine: ReturnType<typeof useDataEngine>;
    resource: string;
    params?: Record<string, any>;
    id?: string;
    queryKey?: QueryKey;
    refetchInterval?: number;
}) => {
    return queryOptions({
        queryKey: [
            resource,
            ...Object.values(params || {}),
            id,
            ...(queryKey || []),
        ],
        queryFn: async () => {
            const response = (await engine.query({
                resource: {
                    resource,
                    id,
                    params,
                },
            })) as { resource: T };
            return response.resource;
        },
        refetchInterval,
    });
};

export const resourcesQueryOptions = ({
    engine,
    queries,
    refetchInterval,
}: {
    engine: ReturnType<typeof useDataEngine>;
    queries: Record<
        string,
        {
            resource: string;
            params?: Record<string, any>;
            id?: string;
        }
    >;
    refetchInterval?: number;
}) => {
    return queryOptions({
        queryKey: Object.keys(queries),
        queryFn: async () => {
            const response = await engine.query(queries);
            return Object.keys(queries).map((k) => response[k]);
        },
        refetchInterval,
    });
};
