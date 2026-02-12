import React, { FC } from "react";

import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    CloseCircleOutlined,
    SyncOutlined,
} from "@ant-design/icons";
import { Flex, Typography } from "antd";

export const getStatusConfig = (syncStatus: string) => {
    switch (syncStatus) {
        case "synced":
            return {
                status: "success" as const,
                text: "Synced",
                icon: <CheckCircleOutlined style={{ color: "#52c41a" }} />,
                color: "#52c41a",
            };
        case "pending":
            return {
                status: "warning" as const,
                text: "Pending",
                icon: <ClockCircleOutlined style={{ color: "#faad14" }} />,
                color: "#faad14",
            };
        case "syncing":
            return {
                status: "processing" as const,
                text: "Syncing",
                icon: <SyncOutlined spin style={{ color: "#1890ff" }} />,
                color: "#1890ff",
            };
        case "failed":
            return {
                status: "error" as const,
                text: "Failed",
                icon: <CloseCircleOutlined style={{ color: "#ff4d4f" }} />,
                color: "#ff4d4f",
            };
        case "draft":
        default:
            return {
                status: "default" as const,
                text: "Draft",
                icon: <ClockCircleOutlined style={{ color: "#d9d9d9" }} />,
                color: "#d9d9d9",
            };
    }
};

export const SyncStatusComp: FC<{
    syncStatus: string;
}> = ({ syncStatus }) => {
    const status = getStatusConfig(syncStatus);
    return (
        <Flex gap={5} align="center">
            {status.icon}
            <Typography.Text type="success" style={{ fontSize: 12 }}>
                {status.text}
            </Typography.Text>
        </Flex>
    );
};
