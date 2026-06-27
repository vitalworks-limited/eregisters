import { Empty, Flex, theme, Typography } from "antd";
import React from "react";

const { Title, Text } = Typography;

interface Props {
    title: string;
    description?: React.ReactNode;
    action?: React.ReactNode;
    /** Pad the surrounding card. Default true. */
    padded?: boolean;
}

export const EmptyState: React.FC<Props> = ({
    title,
    description,
    action,
    padded = true,
}) => {
    const { token } = theme.useToken();
    return (
        <Flex
            vertical
            align="center"
            justify="center"
            gap={token.marginSM}
            style={{
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                paddingBlock: padded ? token.paddingXL : token.padding,
                paddingInline: token.padding,
                width: "100%",
            }}
        >
            <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                    <Flex vertical align="center" gap={token.marginXS}>
                        <Title level={5} style={{ margin: 0 }}>
                            {title}
                        </Title>
                        {description &&
                            (typeof description === "string" ? (
                                <Text type="secondary">{description}</Text>
                            ) : (
                                description
                            ))}
                    </Flex>
                }
            />
            {action && <div style={{ marginTop: token.marginXS }}>{action}</div>}
        </Flex>
    );
};
