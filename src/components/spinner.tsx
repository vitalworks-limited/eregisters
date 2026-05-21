import React, { FC } from "react";
import { Loading3QuartersOutlined } from "@ant-design/icons";
import { Flex, Spin } from "antd";
import { SyncContext } from "../machines";

export const Spinner: FC<{ height?: string; component?: React.ReactNode }> = ({
    height,
    component,
}) => {
    const status = SyncContext.useSelector(
        ({
            context: {
                lastDataPull,
                lastMetadataPull,
                metadataSyncMode,
                dataPullMode,
                dataPushMode,
            },
        }) => ({
            lastDataPull,
            lastMetadataPull,
            metadataSyncMode,
            dataPullMode,
            dataPushMode,
        }),
    );
    return (
        <Flex
            justify="center"
            align="center"
            style={{ height: height || "calc(100vh - 48px)" }}
            vertical
            gap={8}
        >
            <Spin indicator={<Loading3QuartersOutlined spin />} />
            {component}
        </Flex>
    );
};
