import { DownloadOutlined } from "@ant-design/icons";
import { Button, Divider, Flex, Tag, theme, Tooltip, Typography } from "antd";
import React from "react";
import { downloadSyncDiagnostics } from "../sync/telemetry";
import { APP_VERSION, BUILD_HASH, BUILD_TIME } from "../version";

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
    const { token } = theme.useToken();
    const isDev = BUILD_HASH === "local";
    const tooltipTitle = `eRegisters ${APP_VERSION}\nBuild: ${BUILD_HASH}\nBuilt: ${BUILD_TIME}`;
    return (
        <Flex
            align="center"
            justify="center"
            gap={token.marginXS}
            wrap
            style={{
                padding: `${token.paddingSM}px ${token.paddingSM}px`,
            }}
        >
            <Typography.Text
                type="secondary"
                style={{ fontSize: token.fontSizeSM }}
            >
                Developed by{" "}
                <Typography.Link
                    href="https://www.hispuganda.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: token.fontSizeSM, fontWeight: 500 }}
                >
                    HISP Uganda
                </Typography.Link>{" "}
                · © {new Date().getFullYear()}
            </Typography.Text>
            <Divider orientation="vertical" style={{ marginInline: token.marginXS }} />
            <Tooltip title={tooltipTitle}>
                <Typography.Text
                    type="secondary"
                    style={{ fontSize: token.fontSizeSM }}
                >
                    eRegisters v{APP_VERSION} · build {BUILD_HASH}
                </Typography.Text>
            </Tooltip>
            {isDev && (
                <Tooltip title="Dev build: in-app update polling is disabled to prevent reload loops.">
                    <Tag color="default" style={{ marginInlineEnd: 0 }}>
                        dev · auto-update off
                    </Tag>
                </Tooltip>
            )}
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
