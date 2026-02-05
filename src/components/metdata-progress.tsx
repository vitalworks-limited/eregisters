import { useLiveQuery } from "dexie-react-hooks";
import React from "react";
import { db } from "../db";
import { Spinner } from "./spinner";
import { Flex } from "antd";

export default function MetadataProgress({ height }: { height?: string }) {
    const progress = useLiveQuery(async () => {
        const record = await db.metadataSyncProgress.get(
            "metadata-sync-progress",
        );
        return record;
    }, []);
    return (
        <Spinner
            component={
                <Flex vertical align="center" gap={8}>
                    <div>{progress?.status} {progress?.progress?.current}</div>
                    {progress && (
                        <div>Progress: {progress.progress?.percentage}% </div>
                    )}
                </Flex>
            }
						height={height}
        />
    );
}
