import {
    CheckOutlined,
    CopyOutlined,
    DownloadOutlined,
    FileMarkdownOutlined,
    FileTextOutlined,
    MailOutlined,
} from "@ant-design/icons";
import { Button, Drawer, Flex, Segmented, theme, Typography } from "antd";
import React, { useEffect, useMemo, useState } from "react";
import {
    buildTroubleshootingBundle,
    BundleInputs,
    downloadBundleAsJson,
    downloadBundleAsMarkdown,
    TroubleshootingBundle,
} from "./troubleshootingBundle";

const { Title, Text, Paragraph } = Typography;

interface Props {
    open: boolean;
    onClose: () => void;
    /** Either fed an already-built bundle, or the inputs to build one lazily. */
    bundle?: TroubleshootingBundle;
    inputs?: BundleInputs;
    /** Optional default tab. */
    initialTab?: "summary" | "json" | "markdown";
}

function bundleToMarkdown(b: TroubleshootingBundle): string {
    const md: string[] = [];
    md.push(`# eRegisters troubleshooting bundle`);
    md.push("");
    md.push(`Generated ${b.generatedAt}`);
    md.push(`Build ${b.app.version} (${b.app.buildHash})`);
    md.push("");
    md.push(`## Health: ${b.health.band} (${b.health.score}/100)`);
    b.health.evidence.forEach((e) => md.push(`- ${e.label} (${e.delta})`));
    md.push("");
    md.push(`## Insights`);
    if (b.insights.length === 0) {
        md.push("No insights triggered. App appears healthy.");
    }
    for (const insight of b.insights) {
        md.push(`### ${insight.title} _(${insight.severity})_`);
        md.push(`**Likely cause:** ${insight.likelyCause}`);
        md.push(`**Recommendation:** ${insight.recommendation}`);
        md.push(`**Owner / urgency / confidence:** ${insight.owner} / ${insight.urgency} / ${insight.confidence}`);
        if (insight.evidence.length > 0) {
            md.push(`**Evidence:**`);
            insight.evidence.forEach((e) => md.push(`- ${e}`));
        }
        md.push("");
    }
    md.push(`## Facility`);
    md.push(`- ${b.facility?.name ?? "—"} (${b.facility?.id ?? "—"})`);
    md.push("");
    md.push(`## Sync state`);
    md.push(`- Last data pull: ${b.lastDataPull ?? "never"}`);
    md.push(`- Last data push: ${b.lastDataPush ?? "never"}`);
    md.push(`- Last metadata pull: ${b.lastMetadataPull ?? "never"}`);
    md.push(`- Pending TE: ${b.pending.trackedEntities}, enrollments: ${b.pending.enrollments}, events: ${b.pending.events}`);
    md.push("");
    md.push(`## Recent sync telemetry (last ${b.telemetry.length})`);
    for (const t of b.telemetry.slice(0, 8)) {
        const failures = (t.failures?.length ?? 0) > 0 ? ` · ${t.failures!.length} fail` : " · ok";
        md.push(`- ${t.startedAt} · ${t.mode}${failures}`);
    }
    return md.join("\n");
}

export const BundleDrawer: React.FC<Props> = ({
    open,
    onClose,
    bundle: providedBundle,
    inputs,
    initialTab = "summary",
}) => {
    const { token } = theme.useToken();
    const [tab, setTab] = useState<"summary" | "json" | "markdown">(initialTab);
    const [bundle, setBundle] = useState<TroubleshootingBundle | undefined>(
        providedBundle,
    );
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!open) return;
        if (providedBundle) {
            setBundle(providedBundle);
            return;
        }
        if (inputs) {
            buildTroubleshootingBundle(inputs)
                .then(setBundle)
                .catch(() => undefined);
        }
    }, [open, providedBundle, inputs]);

    const json = useMemo(
        () => (bundle ? JSON.stringify(bundle, null, 2) : ""),
        [bundle],
    );
    const markdown = useMemo(() => (bundle ? bundleToMarkdown(bundle) : ""), [
        bundle,
    ]);

    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            // ignore
        }
    };

    const mailto = useMemo(() => {
        if (!bundle) return undefined;
        const subject = `eRegisters bundle · ${bundle.facility?.name ?? "facility"} · ${bundle.app.buildHash}`;
        // mailto: caps at ~2k chars on most clients — send a tight summary
        // and prompt the user to attach JSON manually.
        const body = [
            `Health: ${bundle.health.band} (${bundle.health.score}/100)`,
            `Build: ${bundle.app.version} (${bundle.app.buildHash})`,
            `Facility: ${bundle.facility?.name ?? "—"}`,
            `Insights: ${bundle.insights.length}`,
            "",
            "Insights:",
            ...bundle.insights.map((i) => `- ${i.title} (${i.severity}) — ${i.recommendation}`),
            "",
            "Full bundle attached as JSON or pasted below as Markdown.",
        ].join("\n");
        return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }, [bundle]);

    return (
        <Drawer
            title="Troubleshooting bundle"
            placement="right"
            open={open}
            onClose={onClose}
            size="large"
            styles={{ body: { padding: 0 } }}
            extra={
                <Flex gap={token.marginXS} wrap>
                    <Button
                        icon={<DownloadOutlined />}
                        onClick={() => bundle && downloadBundleAsJson(bundle)}
                        disabled={!bundle}
                    >
                        JSON
                    </Button>
                    <Button
                        icon={<FileMarkdownOutlined />}
                        onClick={() => bundle && downloadBundleAsMarkdown(bundle)}
                        disabled={!bundle}
                    >
                        Markdown
                    </Button>
                    {mailto && (
                        <Button href={mailto} icon={<MailOutlined />}>
                            Email
                        </Button>
                    )}
                </Flex>
            }
        >
            <Flex
                vertical
                gap={token.marginSM}
                style={{
                    padding: token.padding,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                {!bundle ? (
                    <Text type="secondary">Building bundle…</Text>
                ) : (
                    <>
                        <Flex align="center" justify="space-between" wrap>
                            <Title level={5} style={{ margin: 0 }}>
                                {bundle.facility?.name ?? "This device"} ·{" "}
                                {bundle.app.version}
                            </Title>
                            <Segmented
                                value={tab}
                                onChange={(v) =>
                                    setTab(
                                        v as "summary" | "json" | "markdown",
                                    )
                                }
                                options={[
                                    { value: "summary", label: "Summary" },
                                    { value: "json", label: "JSON" },
                                    { value: "markdown", label: "Markdown" },
                                ]}
                            />
                        </Flex>
                        <Text
                            type="secondary"
                            style={{ fontSize: token.fontSizeSM }}
                        >
                            Generated {bundle.generatedAt}. Bundle is
                            sanitised — no clinical payloads, tokens or
                            cookies are included.
                        </Text>
                    </>
                )}
            </Flex>

            <div style={{ padding: token.padding }}>
                {tab === "summary" && bundle && (
                    <Flex vertical gap={token.marginSM}>
                        <Flex vertical gap={token.marginXXS}>
                            <Text type="secondary">Health score</Text>
                            <Text strong>
                                {bundle.health.score}/100 · {bundle.health.band}
                            </Text>
                            {bundle.health.evidence.length > 0 && (
                                <ul
                                    style={{
                                        margin: `${token.marginXXS}px 0 0`,
                                        paddingInlineStart: 18,
                                    }}
                                >
                                    {bundle.health.evidence.map((e, i) => (
                                        <li key={i}>
                                            <Text
                                                type="secondary"
                                                style={{
                                                    fontSize: token.fontSizeSM,
                                                }}
                                            >
                                                {e.label} ({e.delta})
                                            </Text>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Flex>
                        <Flex vertical gap={token.marginXXS}>
                            <Text type="secondary">Pending records</Text>
                            <Text>
                                {bundle.pending.trackedEntities} TE ·{" "}
                                {bundle.pending.enrollments} enrollments ·{" "}
                                {bundle.pending.events} events
                            </Text>
                        </Flex>
                        <Flex vertical gap={token.marginXXS}>
                            <Text type="secondary">Recent sync runs</Text>
                            <Text>
                                {bundle.telemetry.length} ·{" "}
                                {
                                    bundle.telemetry.filter(
                                        (t) => (t.failures?.length ?? 0) > 0,
                                    ).length
                                }{" "}
                                failed
                            </Text>
                        </Flex>
                        <Flex vertical gap={token.marginXXS}>
                            <Text type="secondary">Insights ({bundle.insights.length})</Text>
                            {bundle.insights.length === 0 ? (
                                <Text type="secondary">
                                    Nothing flagged — looks healthy.
                                </Text>
                            ) : (
                                bundle.insights.map((i) => (
                                    <Paragraph
                                        key={i.id}
                                        style={{ marginBottom: token.marginXS }}
                                    >
                                        <Text strong>
                                            [{i.severity}] {i.title}
                                        </Text>
                                        <br />
                                        <Text
                                            type="secondary"
                                            style={{
                                                fontSize: token.fontSizeSM,
                                            }}
                                        >
                                            {i.recommendation}
                                        </Text>
                                    </Paragraph>
                                ))
                            )}
                        </Flex>
                    </Flex>
                )}
                {tab === "json" && bundle && (
                    <Flex vertical gap={token.marginXS}>
                        <Flex justify="flex-end">
                            <Button
                                size="small"
                                icon={
                                    copied ? <CheckOutlined /> : <CopyOutlined />
                                }
                                onClick={() => copy(json)}
                            >
                                {copied ? "Copied" : "Copy JSON"}
                            </Button>
                        </Flex>
                        <pre
                            style={{
                                background: token.colorFillTertiary,
                                padding: token.paddingSM,
                                overflow: "auto",
                                maxHeight: "60vh",
                                fontSize: token.fontSizeSM,
                                margin: 0,
                            }}
                        >
                            {json}
                        </pre>
                    </Flex>
                )}
                {tab === "markdown" && bundle && (
                    <Flex vertical gap={token.marginXS}>
                        <Flex justify="flex-end">
                            <Button
                                size="small"
                                icon={
                                    copied ? <CheckOutlined /> : <FileTextOutlined />
                                }
                                onClick={() => copy(markdown)}
                            >
                                {copied ? "Copied" : "Copy Markdown"}
                            </Button>
                        </Flex>
                        <pre
                            style={{
                                background: token.colorFillTertiary,
                                padding: token.paddingSM,
                                overflow: "auto",
                                maxHeight: "60vh",
                                fontSize: token.fontSizeSM,
                                margin: 0,
                                whiteSpace: "pre-wrap",
                            }}
                        >
                            {markdown}
                        </pre>
                    </Flex>
                )}
            </div>
        </Drawer>
    );
};
