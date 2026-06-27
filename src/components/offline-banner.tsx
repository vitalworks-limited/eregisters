import { DisconnectOutlined } from "@ant-design/icons";
import { Flex, theme, Typography } from "antd";
import React, { useEffect, useState } from "react";

const { Text } = Typography;

export const OfflineBanner: React.FC = () => {
    const { token } = theme.useToken();
    const [isOnline, setIsOnline] = useState(
        typeof navigator !== "undefined" ? navigator.onLine : true,
    );

    useEffect(() => {
        const on = () => setIsOnline(true);
        const off = () => setIsOnline(false);
        window.addEventListener("online", on);
        window.addEventListener("offline", off);
        return () => {
            window.removeEventListener("online", on);
            window.removeEventListener("offline", off);
        };
    }, []);

    if (isOnline) return null;

    return (
        <Flex
            align="center"
            justify="center"
            gap={token.marginXS}
            role="status"
            aria-live="polite"
            style={{
                background: `${token.colorWarning}14`,
                borderBottom: `1px solid ${token.colorWarning}40`,
                color: token.colorWarningText,
                paddingBlock: token.paddingXXS,
                paddingInline: token.padding,
                fontSize: token.fontSizeSM,
            }}
        >
            <DisconnectOutlined style={{ color: token.colorWarning }} />
            <Text style={{ color: token.colorWarningText }}>
                You're offline — changes are saved locally and will sync when
                you reconnect.
            </Text>
        </Flex>
    );
};
