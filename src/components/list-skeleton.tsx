import { Skeleton, theme } from "antd";
import React from "react";

interface Props {
    rows?: number;
}

export const ListSkeleton: React.FC<Props> = ({ rows = 6 }) => {
    const { token } = theme.useToken();
    return (
        <div
            style={{
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                padding: token.padding,
            }}
        >
            {Array.from({ length: rows }).map((_, i) => (
                <Skeleton
                    key={i}
                    paragraph={{ rows: 1, width: ["60%"] }}
                    title={{ width: "30%" }}
                    active
                    style={{ marginBottom: token.marginSM }}
                />
            ))}
        </div>
    );
};
