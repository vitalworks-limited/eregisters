import React from "react";
import { Table, Button, Space } from "antd";
import { EditOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { ColumnsType, TableProps } from "antd/es/table";

interface DataTableProps<T> extends Omit<TableProps<T>, "columns"> {
    columns: ColumnsType<T>;
    onEdit?: (record: T) => void;
    onDelete?: (record: T) => void;
    onCreate?: () => void;
    createButtonText?: string;
    showActions?: boolean;
    actionColumnWidth?: number;
}

export function DataTable<T extends Record<string, any>>({
    columns,
    onEdit,
    onDelete,
    onCreate,
    createButtonText = "Create New",
    showActions = true,
    actionColumnWidth = 150,
    ...tableProps
}: DataTableProps<T>) {
    const columnsWithActions: ColumnsType<T> =
        showActions && (onEdit || onDelete)
            ? [
                  ...columns,
                  {
                      title: "Actions",
                      key: "actions",
                      fixed: "right",
                      width: actionColumnWidth,
                      render: (_, record) => (
                          <Space size="small">
                              {onEdit && (
                                  <Button
                                      type="link"
                                      size="small"
                                      icon={<EditOutlined />}
                                      onClick={() => onEdit(record)}
                                  >
                                      Edit
                                  </Button>
                              )}
                              {onDelete && (
                                  <Button
                                      type="link"
                                      size="small"
                                      danger
                                      icon={<DeleteOutlined />}
                                      onClick={() => onDelete(record)}
                                  >
                                      Delete
                                  </Button>
                              )}
                          </Space>
                      ),
                  },
              ]
            : columns;

    return (
        <div>
            {onCreate && (
                <div
                    style={{
                        marginBottom: 16,
                        display: "flex",
                        justifyContent: "flex-end",
                    }}
                >
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={onCreate}
                    >
                        {createButtonText}
                    </Button>
                </div>
            )}
            <Table {...tableProps} columns={columnsWithActions} />
        </div>
    );
}
