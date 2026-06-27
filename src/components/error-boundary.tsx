import { ReloadOutlined } from "@ant-design/icons";
import { Button, Flex, Result, theme, Typography } from "antd";
import React from "react";

const { Paragraph, Text } = Typography;

interface Props {
    children: React.ReactNode;
    /** Optional reset handler — e.g. clear a cache before rerendering. */
    onReset?: () => void;
}

interface State {
    error: Error | null;
    info: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { error: null, info: null };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        this.setState({ error, info });
        console.error("[ErrorBoundary]", error, info);
    }

    handleReset = () => {
        this.props.onReset?.();
        this.setState({ error: null, info: null });
    };

    render() {
        if (!this.state.error) return this.props.children;
        return <ErrorPanel state={this.state} onReset={this.handleReset} />;
    }
}

const ErrorPanel: React.FC<{ state: State; onReset: () => void }> = ({
    state,
    onReset,
}) => {
    const { token } = theme.useToken();
    const message = state.error?.message ?? "Unknown error";
    const diagnostics = JSON.stringify(
        {
            message,
            stack: state.error?.stack,
            componentStack: state.info?.componentStack,
            at: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href,
        },
        null,
        2,
    );
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(diagnostics);
        } catch {
            // ignore
        }
    };
    return (
        <Flex
            align="center"
            justify="center"
            style={{
                background: token.colorBgLayout,
                padding: token.padding,
                minHeight: 320,
            }}
        >
            <div
                style={{
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    maxWidth: 720,
                    width: "100%",
                }}
            >
                <Result
                    status="error"
                    title="Something went wrong"
                    subTitle={message}
                    extra={[
                        <Button
                            key="reset"
                            type="primary"
                            icon={<ReloadOutlined />}
                            onClick={onReset}
                        >
                            Try again
                        </Button>,
                        <Button key="copy" onClick={copy}>
                            Copy diagnostics
                        </Button>,
                    ]}
                />
                <details style={{ padding: token.padding }}>
                    <summary>
                        <Text type="secondary">Technical details</Text>
                    </summary>
                    <Paragraph>
                        <pre
                            style={{
                                background: token.colorFillTertiary,
                                padding: token.padding,
                                overflow: "auto",
                                maxHeight: 240,
                                fontSize: token.fontSizeSM,
                            }}
                        >
                            {diagnostics}
                        </pre>
                    </Paragraph>
                </details>
            </div>
        </Flex>
    );
};
