import { theme, Tooltip } from "antd";
import React, { useEffect, useState } from "react";

export const OnlineIndicator: React.FC = () => {
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

    const color = isOnline ? token.colorSuccess : token.colorTextTertiary;
    const title = isOnline
        ? "Online"
        : "Offline — changes will sync when you reconnect.";

    return (
        <Tooltip title={title}>
            <span
                aria-label={title}
                role="status"
                aria-live="polite"
                style={{
                    width: 8,
                    height: 8,
                    background: color,
                    display: "inline-block",
                    outline: isOnline
                        ? `3px solid ${token.colorSuccess}1f`
                        : "none",
                }}
            />
        </Tooltip>
    );
};
