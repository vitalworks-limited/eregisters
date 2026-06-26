import { DownloadOutlined } from "@ant-design/icons";
import { Button, Flex, Tooltip, Typography } from "antd";
import React from "react";
import { downloadSyncDiagnostics } from "../sync/telemetry";
import { APP_VERSION, BUILD_HASH, BUILD_TIME } from "../version";

/**
 * Small support footer surfaced on the main layout (Phase 17.9).
 * Shows the current version + build hash + a "download diagnostics"
 * action so field support can identify which build a device is running.
 */
async function handleDownload() {
    const blob = await downloadSyncDiagnostics();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eregisters-diagnostics-${APP_VERSION}-${BUILD_HASH}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export const SupportInfo: React.FC = () => {
    const tooltipTitle = `eRegisters ${APP_VERSION}\nBuild: ${BUILD_HASH}\nBuilt: ${BUILD_TIME}`;
    return (
        <Flex
            align="center"
            justify="center"
            gap={8}
            style={{
                padding: "4px 8px",
                fontSize: 11,
                color: "rgba(0, 0, 0, 0.45)",
            }}
        >
            <Tooltip title={tooltipTitle}>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    eRegisters v{APP_VERSION} · build {BUILD_HASH}
                </Typography.Text>
            </Tooltip>
            <Tooltip title="Download sync diagnostics (support)">
                <Button
                    type="text"
                    size="small"
                    icon={<DownloadOutlined />}
                    onClick={handleDownload}
                />
            </Tooltip>
        </Flex>
    );
};
