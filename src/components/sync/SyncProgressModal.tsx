import { Modal, Progress, Space, Typography, Alert } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import React from "react";
import type { SyncProgress, SyncResult } from "../../db/batch-sync";

const { Text, Title } = Typography;

export interface SyncProgressModalProps {
    visible: boolean;
    progress: SyncProgress | null;
    result: SyncResult | null;
    onClose: () => void;
}

/**
 * Sync Progress Modal Component
 *
 * Displays real-time progress for batch sync operations with detailed metrics.
 */
export const SyncProgressModal: React.FC<SyncProgressModalProps> = ({
    visible,
    progress,
    result,
    onClose,
}) => {
    const isComplete = result !== null;
    const isSuccess = result?.success ?? false;

    return (
        <Modal
            title="Syncing Data"
            open={visible}
            onCancel={onClose}
            footer={isComplete ? null : undefined}
            closable={isComplete}
            maskClosable={false}
        >
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
                {/* Progress Bar */}
                {progress && !isComplete && (
                    <>
                        <Progress
                            percent={progress.percentage}
                            status="active"
                            strokeColor={{
                                "0%": "#108ee9",
                                "100%": "#87d068",
                            }}
                        />

                        <Space direction="vertical" size="small">
                            <Text>
                                Batch {progress.currentBatch} of{" "}
                                {progress.totalBatches}
                            </Text>
                            <Text type="secondary">
                                {progress.completed} of {progress.total} items
                                synced
                            </Text>
                            {progress.failed > 0 && (
                                <Text type="danger">
                                    {progress.failed} failed
                                </Text>
                            )}
                        </Space>
                    </>
                )}

                {/* Result Summary */}
                {isComplete && result && (
                    <>
                        {isSuccess ? (
                            <Alert
                                message="Sync Completed Successfully"
                                description={`${result.synced} items synced successfully`}
                                type="success"
                                icon={<CheckCircleOutlined />}
                                showIcon
                            />
                        ) : (
                            <Alert
                                message="Sync Completed with Errors"
                                description={`${result.synced} synced, ${result.failed} failed`}
                                type="warning"
                                icon={<CloseCircleOutlined />}
                                showIcon
                            />
                        )}

                        {/* Error Details */}
                        {result.errors.length > 0 && (
                            <div>
                                <Text strong>Failed Items:</Text>
                                <ul style={{ margin: "8px 0", paddingLeft: 20, maxHeight: 200, overflow: "auto" }}>
                                    {result.errors.map((error, index) => (
                                        <li key={index}>
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                {error.id}: {error.error}
                                            </Text>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </>
                )}
            </Space>
        </Modal>
    );
};
