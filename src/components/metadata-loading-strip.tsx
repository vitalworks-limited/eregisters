import { Flex, Progress, theme, Typography } from "antd";
import React, { useEffect, useState, useSyncExternalStore } from "react";
import {
    getProgressSnapshot,
    labelFor,
    subscribe,
} from "../sync/metadataProgress";

const { Title, Text } = Typography;

function useMetadataProgress() {
    return useSyncExternalStore(subscribe, getProgressSnapshot, () =>
        getProgressSnapshot(),
    );
}

/**
 * Inline metadata-loading view rendered inside the regular app shell
 * (i.e. below the brand and nav bars, sharing the layout background).
 *
 * Deliberately minimal — no card, no decorative panel, no different
 * background color from the surrounding chrome. Just the name of the
 * resource currently being pulled, a single thin progress bar, and a
 * subtle step counter underneath. This stops the previous "screen swap"
 * flicker when the app shell mounts before metadata is ready.
 */
export const MetadataLoadingStrip: React.FC = () => {
    const { token } = theme.useToken();
    const progress = useMetadataProgress();
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    useEffect(() => {
        const startedAt = progress.startedAt ?? Date.now();
        const tick = () =>
            setElapsedSeconds(
                Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
            );
        tick();
        const id = window.setInterval(tick, 1000);
        return () => window.clearInterval(id);
    }, [progress.startedAt]);

    const total = Math.max(progress.steps.length, 1);
    const completed = progress.phase === "done" ? total : progress.current;
    const percent = Math.min(
        100,
        Math.round(
            ((completed + (progress.phase === "saving" ? 0.5 : 0)) / total) *
                100,
        ),
    );

    const headline =
        progress.phase === "saving"
            ? "Saving locally"
            : progress.phase === "done"
              ? "Almost there"
              : progress.phase === "error"
                ? "Sync failed"
                : progress.phase === "pulling" && progress.label
                  ? `Loading ${progress.label.toLowerCase()}`
                  : "Preparing your workspace";

    const step =
        progress.steps.length > 0 && progress.phase !== "idle"
            ? `Step ${Math.min(progress.current + 1, total)} of ${total}`
            : undefined;

    const stepDetail =
        progress.steps.length > 1 && progress.current + 1 < total
            ? labelFor(progress.steps[progress.current + 1])
            : undefined;

    return (
        <Flex
            align="center"
            justify="center"
            vertical
            style={{
                flex: 1,
                paddingInline: token.padding,
                paddingBlock: token.paddingXL,
                background: "transparent",
            }}
        >
            <div style={{ width: "min(420px, 100%)" }}>
                <Title
                    level={3}
                    style={{
                        margin: 0,
                        textAlign: "center",
                        marginBottom: token.marginSM,
                        fontWeight: 500,
                        letterSpacing: -0.2,
                    }}
                >
                    {headline}
                </Title>
                <Progress
                    percent={percent}
                    showInfo={false}
                    strokeColor={
                        progress.phase === "error"
                            ? token.colorError
                            : token.colorPrimary
                    }
                    trailColor={token.colorBorderSecondary}
                    status={
                        progress.phase === "error"
                            ? "exception"
                            : progress.phase === "done"
                              ? "success"
                              : "active"
                    }
                    style={{ marginBottom: token.marginXS }}
                />
                <Flex
                    align="center"
                    justify="space-between"
                    gap={token.marginXS}
                    style={{
                        fontSize: token.fontSizeSM,
                        color: token.colorTextTertiary,
                    }}
                >
                    <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                        {step ?? "Preparing…"}
                    </Text>
                    <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                        {elapsedSeconds}s
                    </Text>
                </Flex>
                {stepDetail && (
                    <Text
                        type="secondary"
                        style={{
                            display: "block",
                            textAlign: "center",
                            fontSize: token.fontSizeSM,
                            marginTop: token.marginSM,
                            opacity: 0.7,
                        }}
                    >
                        Up next · {stepDetail}
                    </Text>
                )}
                {progress.error && (
                    <Text
                        type="danger"
                        style={{
                            display: "block",
                            textAlign: "center",
                            fontSize: token.fontSizeSM,
                            marginTop: token.marginSM,
                        }}
                    >
                        {progress.error}
                    </Text>
                )}
            </div>
        </Flex>
    );
};
