import React, { FC } from "react";

import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    CloseCircleOutlined,
    SyncOutlined,
} from "@ant-design/icons";
import { Flex, theme, Typography } from "antd";

type StatusKey = "synced" | "pending" | "syncing" | "failed" | "draft";

const statusMeta: Record<
    StatusKey,
    {
        text: string;
        tone: "success" | "warning" | "info" | "error" | "muted";
    }
> = {
    synced: { text: "Synced", tone: "success" },
    pending: { text: "Pending", tone: "warning" },
    syncing: { text: "Syncing", tone: "info" },
    failed: { text: "Failed", tone: "error" },
    draft: { text: "Draft", tone: "muted" },
};

export const SyncStatusComp: FC<{ syncStatus: string }> = ({ syncStatus }) => {
    const { token } = theme.useToken();
    const meta =
        statusMeta[syncStatus as StatusKey] ?? statusMeta.draft;

    const color =
        meta.tone === "success"
            ? token.colorSuccess
            : meta.tone === "warning"
              ? token.colorWarning
              : meta.tone === "info"
                ? token.colorInfo
                : meta.tone === "error"
                  ? token.colorError
                  : token.colorTextTertiary;

    const iconStyle = { color };
    const Icon =
        meta.tone === "success"
            ? CheckCircleOutlined
            : meta.tone === "info"
              ? SyncOutlined
              : meta.tone === "error"
                ? CloseCircleOutlined
                : ClockCircleOutlined;

    return (
        <Flex gap={token.marginXS} align="center">
            <Icon spin={meta.tone === "info"} style={iconStyle} />
            <Typography.Text style={{ color, fontSize: token.fontSizeSM }}>
                {meta.text}
            </Typography.Text>
        </Flex>
    );
};
