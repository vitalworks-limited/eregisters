import { HomeOutlined } from "@ant-design/icons";
import { Flex, theme, Tooltip, Typography } from "antd";
import React from "react";

interface Props {
    name?: string;
    id?: string;
}

const { Text } = Typography;

export const OrgUnitChip: React.FC<Props> = ({ name, id }) => {
    const { token } = theme.useToken();
    if (!name) return null;
    return (
        <Tooltip title={id ? `Facility ID: ${id}` : undefined}>
            <Flex
                align="center"
                gap={token.marginXS}
                style={{
                    paddingInline: token.paddingSM,
                    paddingBlock: token.paddingXXS,
                    background: token.colorFillQuaternary,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    maxWidth: 280,
                }}
            >
                <HomeOutlined style={{ color: token.colorPrimary }} />
                <Text
                    strong
                    style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {name}
                </Text>
            </Flex>
        </Tooltip>
    );
};
