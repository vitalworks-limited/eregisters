import { UserAddOutlined } from "@ant-design/icons";
import type { FormInstance } from "antd";
import {
    Alert,
    Avatar,
    Button,
    Flex,
    Form,
    Grid,
    Modal,
    Spin,
    theme,
    Typography,
} from "antd";
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
    onCancel?: () => Promise<void>;
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
    requiredFields?: string[];
}

const { Text } = Typography;

interface ModalContentProps<T extends FlattenedTrackedEntity | FlattenedEvent> {
    children: (form: FormInstance) => React.ReactNode;
    onSave: DataModalProps<T>["onSave"];
    onClose: () => void;
    isMobile: boolean;
    submitButtonText: string;
    hasAddAnother: boolean;
    status: string;
    requiredFields?: string[];
    title: React.ReactNode;
    open: boolean;
    onCancel: () => void;
    loading: boolean;
    setLoading: (v: boolean) => void;
}

function ModalContent<T extends FlattenedTrackedEntity | FlattenedEvent>({
    children,
    onSave,
    onClose,
    isMobile,
    submitButtonText,
    hasAddAnother,
    status,
    requiredFields,
    title,
    open,
    onCancel,
    loading,
    setLoading,
}: ModalContentProps<T>) {
    const [form] = Form.useForm<T>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const watchedValues: Record<string, any> =
        Form.useWatch((values) => values, form) ?? {};
    const isSubmitDisabled =
        requiredFields?.some((f) => !watchedValues[f]) ?? false;

    const [contentReady, setContentReady] = useState(false);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);

    useEffect(() => {
        if (open) {
            setContentReady(false);
            const raf = requestAnimationFrame(() => setContentReady(true));
            return () => cancelAnimationFrame(raf);
        } else {
            setContentReady(false);
            setValidationErrors([]);
        }
    }, [open]);

    const handleOk = async (addAnother = false) => {
        try {
            const values = await form.validateFields();
            setValidationErrors([]);
            setLoading(true);
            await onSave({ values, addAnother });
            if (!addAnother) {
                onClose();
            }
        } catch (error) {
            const errs =
                (error as { errorFields?: Array<{ errors: string[] }> })
                    ?.errorFields ?? [];
            const messages = errs
                .flatMap((f) => f.errors)
                .filter((m): m is string => Boolean(m));
            setValidationErrors(
                messages.length
                    ? messages
                    : ["Please review the fields highlighted above."],
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Modal
                open={open}
                onCancel={onCancel}
                centered
                destroyOnHidden={true}
                confirmLoading={loading}
                mask={{ closable: false }}
                title={title}
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
                                onClick={onCancel}
                                disabled={loading}
                                block={isMobile}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="primary"
                                onClick={() => handleOk()}
                                loading={loading}
                                disabled={isSubmitDisabled || loading}
                                block={isMobile}
                                style={
                                    isMobile
                                        ? {
                                              whiteSpace: "normal" as const,
                                              wordBreak: "break-word" as const,
                                              height: "auto",
                                          }
                                        : undefined
                                }
                            >
                                {submitButtonText}
                            </Button>
                            {hasAddAnother && (
                                <Button
                                    onClick={() => handleOk(true)}
                                    loading={loading}
                                    disabled={isSubmitDisabled || loading}
                                    block={isMobile}
                                    style={
                                        isMobile
                                            ? {
                                                  whiteSpace:
                                                      "normal" as const,
                                                  wordBreak:
                                                      "break-word" as const,
                                                  height: "auto",
                                              }
                                            : undefined
                                    }
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
                }}
            >
                {contentReady ? (
                    <>
                        {validationErrors.length > 0 && (
                            <Alert
                                type="error"
                                showIcon
                                style={{ marginBottom: 16 }}
                                title="Please fix the following before continuing"
                                description={
                                    <ul
                                        style={{
                                            margin: 0,
                                            paddingInlineStart: 20,
                                        }}
                                    >
                                        {validationErrors
                                            .slice(0, 6)
                                            .map((m, i) => (
                                                <li key={i}>{m}</li>
                                            ))}
                                        {validationErrors.length > 6 && (
                                            <li>
                                                …and{" "}
                                                {validationErrors.length - 6}{" "}
                                                more
                                            </li>
                                        )}
                                    </ul>
                                }
                                closable
                                onClose={() => setValidationErrors([])}
                            />
                        )}
                        {children(form)}
                    </>
                ) : (
                    <Flex
                        justify="center"
                        align="center"
                        style={{ padding: 40 }}
                    >
                        <Spin size="large" />
                    </Flex>
                )}
            </Modal>
        </>
    );
}

export function DataModal<T extends FlattenedTrackedEntity | FlattenedEvent>({
    open,
    onClose,
    onCancel,
    onSave,
    title = "Edit Data",
    children,
    submitButtonText = "Save",
    hasAddAnother = false,
    status = "draft",
    requiredFields,
}: DataModalProps<T>) {
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.md;
    const { token } = theme.useToken();
    const [loading, setLoading] = useState(false);
    const [openCount, setOpenCount] = useState(0);

    useEffect(() => {
        if (open) {
            setOpenCount((c) => c + 1);
        }
    }, [open]);

    const handleCancel = () => {
        onClose();
        onCancel?.();
    };

    const titleNode = (
        <Flex align="center" gap="middle">
            <Avatar
                shape="square"
                size={36}
                style={{ backgroundColor: token.colorPrimary }}
                icon={<UserAddOutlined />}
            />
            <Text strong style={{ fontSize: token.fontSizeHeading5 }}>
                {title}
            </Text>
        </Flex>
    );

    return (
        <ModalContent<T>
            key={openCount}
            open={open}
            onClose={onClose}
            onCancel={handleCancel}
            onSave={onSave}
            isMobile={isMobile}
            submitButtonText={submitButtonText}
            hasAddAnother={hasAddAnother}
            status={status}
            requiredFields={requiredFields}
            title={titleNode}
            loading={loading}
            setLoading={setLoading}
        >
            {children}
        </ModalContent>
    );
}
