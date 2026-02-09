import type { FormInstance } from "antd";
import { UserAddOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { Button, Flex, Form, Modal, Typography } from "antd";
import React from "react";

interface DataModalProps<T> {
    open: boolean;
    data: T | null;
    onClose: () => void;
    onSave: (values: T, addAnother?: boolean) => void | Promise<void>;
    title?: string;
    children: (form: FormInstance) => React.ReactNode;
    submitButtonText?: string;
    onValueChange?: (changedValues: any, allValues: any) => void;
    hasAddAnother?: boolean;
}

const { Text } = Typography;

export function DataModal<T extends Record<string, any>>({
    open,
    data,
    onClose,
    onSave,
    title = "Edit Data",
    children,
    submitButtonText = "Save",
    onValueChange,
    hasAddAnother = false,
}: DataModalProps<T>) {
    const [form] = Form.useForm<T>();
    const [loading, setLoading] = React.useState(false);

    React.useEffect(() => {
        form.resetFields();
        if (open && data) {
            form.setFieldsValue(data.attributes || data.dataValues);
        } else {
            form.resetFields();
        }
    }, [open, data, form]);

    const handleOk = async (addAnother: boolean = false) => {
        try {
            const values = await form.validateFields();
            setLoading(true);
            await onSave(values, addAnother);
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
                    justify="space-between"
                    align="center"
                    style={{ padding: "8px 0" }}
                >
                    <Flex gap={5} align="center">
                        <CheckCircleOutlined style={{ color: "#52c41a" }} />
                        <Text type="success" style={{ fontSize: 12 }}>
                            Synced
                        </Text>
                    </Flex>
                    <Flex gap="middle">
                        <Button
                            onClick={() => {
                                form.resetFields();
                                onClose();
                            }}
                            style={{ borderRadius: 8 }}
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
                                paddingLeft: 32,
                                paddingRight: 32,
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
                                    paddingLeft: 32,
                                    paddingRight: 32,
                                }}
                                onClick={() => handleOk(true)}
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
            <Form
                form={form}
                layout="vertical"
                preserve={false}
                onValuesChange={onValueChange}
            >
                {children(form)}
            </Form>
        </Modal>
    );
}
