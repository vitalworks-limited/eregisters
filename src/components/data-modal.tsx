import { UserAddOutlined } from "@ant-design/icons";
import type { FormInstance } from "antd";
import { Button, Flex, Form, Grid, Modal, Spin, Typography } from "antd";
import React, { useEffect, useState } from "react";
import { SyncStatusComp } from "./sync-status-comp";
import {
    FlattenedEnrollment,
    FlattenedEvent,
    FlattenedTrackedEntity,
} from "../schemas";

interface DataModalProps<T extends FlattenedTrackedEntity | FlattenedEvent> {
    open: boolean;
    data: T | null;
    onClose: () => void;
    onSave: (currentInfo: {
        values: Record<string, any>;
        addAnother?: boolean;
    }) => void | Promise<void>;
    enrollment: FlattenedEnrollment | null;
    title?: string;
    children: (form: FormInstance) => React.ReactNode;
    submitButtonText?: string;
    hasAddAnother?: boolean;
    status?: string;
}

const { Text } = Typography;

export function DataModal<T extends FlattenedTrackedEntity | FlattenedEvent>({
    open,
    onClose,
    onSave,
    title = "Edit Data",
    children,
    submitButtonText = "Save",
    hasAddAnother = false,
    status = "draft",
}: DataModalProps<T>) {
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.md;
    const [form] = Form.useForm<T>();
    const [loading, setLoading] = React.useState(false);

    const [contentReady, setContentReady] = useState(false);

    useEffect(() => {
        if (open) {
            // Defensive: reset before scheduling RAF. With destroyOnHidden=true this
            // is a no-op (component remounts fresh), but guards if that ever changes.
            setContentReady(false);
            const raf = requestAnimationFrame(() => setContentReady(true));
            return () => cancelAnimationFrame(raf); // cancel if open flips back before RAF fires
        } else {
            // Defensive reset: keeps correctness if destroyOnHidden is ever removed.
            // No cleanup needed — no pending RAF to cancel in this branch.
            setContentReady(false);
        }
    }, [open]);

    const handleOk = async (addAnother: boolean = false) => {
        try {
            const values = await form.validateFields();
            setLoading(true);
            await onSave({ values, addAnother });
            if (!addAnother) {
                onClose();
            }
        } catch (error) {
            console.error("Validation failed:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            open={open}
            onCancel={onClose}
            centered
            destroyOnHidden={true}
            confirmLoading={loading}
            title={
                <Flex align="center" gap="middle">
                    <div
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: "50%",
                            background:
                                "linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                        }}
                    >
                        <UserAddOutlined style={{ fontSize: 20 }} />
                    </div>
                    <Text strong style={{ fontSize: 18, color: "#1f2937" }}>
                        {title}
                    </Text>
                </Flex>
            }
            width="95vw"
            footer={
                <Flex
                    justify={isMobile ? "center" : "space-between"}
                    align={isMobile ? "stretch" : "center"}
                    vertical={isMobile}
                    gap={isMobile ? 8 : 0}
                    style={{ padding: "8px 0" }}
                >
                    <SyncStatusComp syncStatus={status} />
                    <Flex
                        gap="middle"
                        vertical={isMobile}
                        style={isMobile ? { width: "100%" } : undefined}
                    >
                        <Button
                            onClick={() => {
                                onClose();
                            }}
                            style={{
                                borderRadius: 8,
                                ...(isMobile && { width: "100%" }),
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="primary"
                            onClick={() => handleOk()}
                            loading={loading}
                            style={{
                                background:
                                    "linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)",
                                borderColor: "#7c3aed",
                                borderRadius: 8,
                                fontWeight: 500,
                                ...(isMobile
                                    ? {
                                          width: "100%",
                                          whiteSpace: "normal" as const,
                                          wordBreak: "break-word" as const,
                                          height: "auto",
                                          padding: "8px 16px",
                                      }
                                    : {
                                          paddingLeft: 32,
                                          paddingRight: 32,
                                      }),
                            }}
                        >
                            {submitButtonText}
                        </Button>
                        {hasAddAnother && (
                            <Button
                                type="primary"
                                style={{
                                    background:
                                        "linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)",
                                    borderColor: "#7c3aed",
                                    borderRadius: 8,
                                    fontWeight: 500,
                                    ...(isMobile
                                        ? {
                                              width: "100%",
                                              whiteSpace: "normal" as const,
                                              wordBreak:
                                                  "break-word" as const,
                                              height: "auto",
                                              padding: "8px 16px",
                                          }
                                        : {
                                              paddingLeft: 32,
                                              paddingRight: 32,
                                          }),
                                }}
                                onClick={() => handleOk(true)}
                                loading={loading}
                            >
                                {submitButtonText} & add another
                            </Button>
                        )}
                    </Flex>
                </Flex>
            }
            styles={{
                body: {
                    maxHeight: "75vh",
                    overflow: "auto",
                },
                wrapper: {},
                container: {
                    backgroundColor: "#f5f5f5",
                },
            }}
        >
            {contentReady
                ? children(form)
                : (
                    <Flex justify="center" align="center" style={{ padding: 40 }}>
                        <Spin size="large" />
                    </Flex>
                )
            }
        </Modal>
    );
}
