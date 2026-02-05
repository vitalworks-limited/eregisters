import React, { FC } from "react";
import { Loading3QuartersOutlined } from "@ant-design/icons";
import { Flex, Spin } from "antd";

export const Spinner: FC<{ height?: string,component?: React.ReactNode }> = ({ height, component }) => {
    return (
        <Flex
            justify="center"
            align="center"
            style={{ height: height || "calc(100vh - 48px)" }}
            vertical
						gap={8}
        >
            <Spin indicator={<Loading3QuartersOutlined spin />} />
						{component && <div>{component}</div>}
        </Flex>
    );
};
