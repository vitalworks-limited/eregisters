import { DownOutlined, UpOutlined } from "@ant-design/icons";
import {
    Button,
    Empty,
    Grid,
    Pagination,
    Spin,
    Table,
    TableProps,
    theme,
    Typography,
} from "antd";
import type { ColumnType } from "antd/es/table";
import React, { useMemo, useState } from "react";

const { Text } = Typography;

export type ResponsiveColumnType<T> = ColumnType<T> & {
    /** Use this column's rendered value as the collapsed-card header on mobile. */
    mobilePrimary?: boolean;
    /** Don't show this column at all on mobile. */
    mobileHidden?: boolean;
};

export type ResponsiveTableProps<T> = Omit<TableProps<T>, "columns"> & {
    columns?: ResponsiveColumnType<T>[];
};

/**
 * Drop-in replacement for antd `<Table>`. Renders the regular table on
 * desktop and a list of collapsible "Label: value" cards on mobile
 * (below the `lg` breakpoint, matching the project's existing
 * `isMobile` convention). Pass any extra hint via column flags:
 *   - `mobilePrimary` — show in the always-visible card header
 *   - `mobileHidden`  — never show on mobile
 * Defaults are sensible: the first non-action column becomes the
 * primary header, every other column appears in the expanded body.
 */
export function ResponsiveTable<T extends object>(
    props: ResponsiveTableProps<T>,
) {
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.lg;
    if (!isMobile) {
        return <Table {...(props as TableProps<T>)} />;
    }
    return <MobileCards<T> {...props} />;
}

function resolveValue<T>(
    col: ResponsiveColumnType<T>,
    row: T,
    index: number,
): React.ReactNode {
    const dataIndex = col.dataIndex;
    let value: unknown;
    if (Array.isArray(dataIndex)) {
        value = dataIndex.reduce<unknown>((o, k) => {
            if (o == null) return undefined;
            return (o as Record<string, unknown>)[String(k)];
        }, row as unknown);
    } else if (typeof dataIndex === "string" || typeof dataIndex === "number") {
        value = (row as Record<string, unknown>)[String(dataIndex)];
    }
    if (col.render) {
        const out = col.render(value, row, index);
        // antd's render can return either a ReactNode or { children, props } —
        // we only care about the ReactNode in this shape.
        if (
            out &&
            typeof out === "object" &&
            "children" in (out as Record<string, unknown>) &&
            !React.isValidElement(out as React.ReactNode)
        ) {
            return (out as { children: React.ReactNode }).children;
        }
        return out as React.ReactNode;
    }
    return value as React.ReactNode;
}

function rowKeyOf<T>(
    row: T,
    index: number,
    rowKey: TableProps<T>["rowKey"],
): React.Key {
    if (typeof rowKey === "function") return rowKey(row);
    if (typeof rowKey === "string" && row && typeof row === "object") {
        const v = (row as Record<string, unknown>)[rowKey];
        if (v != null) return v as React.Key;
    }
    return index;
}

function MobileCards<T extends object>({
    columns = [],
    dataSource = [],
    rowKey,
    pagination,
    onRow,
    loading,
    locale,
    title,
}: ResponsiveTableProps<T>) {
    const { token } = theme.useToken();

    const visibleCols = useMemo(
        () => columns.filter((c) => !c.mobileHidden),
        [columns],
    );

    const primaryCol = useMemo(() => {
        const explicit = visibleCols.find((c) => c.mobilePrimary);
        if (explicit) return explicit;
        // Default: the first non-action column. Action columns are
        // typically marked `fixed: "right"` in this codebase.
        return (
            visibleCols.find(
                (c) => c.fixed !== "right" && (c.dataIndex || c.render),
            ) ?? visibleCols[0]
        );
    }, [visibleCols]);

    const bodyCols = useMemo(
        () => visibleCols.filter((c) => c !== primaryCol),
        [visibleCols, primaryCol],
    );

    const paginationEnabled = pagination !== false;
    const paginationObj =
        paginationEnabled && typeof pagination === "object" ? pagination : {};
    const pageSize = paginationObj.pageSize ?? 10;
    const controlled = paginationObj.current !== undefined;
    const [internalCurrent, setInternalCurrent] = useState(
        paginationObj.defaultCurrent ?? 1,
    );
    const current = controlled
        ? (paginationObj.current as number)
        : internalCurrent;

    const allRows = Array.from(dataSource);
    const sliced = paginationEnabled
        ? allRows.slice((current - 1) * pageSize, current * pageSize)
        : allRows;

    const handlePageChange = (page: number, size: number) => {
        if (!controlled) setInternalCurrent(page);
        paginationObj.onChange?.(page, size);
    };

    const titleNode =
        typeof title === "function" ? title(allRows as readonly T[]) : null;

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                gap: token.marginSM,
            }}
        >
            {titleNode ? <div>{titleNode}</div> : null}
            <Spin
                spinning={
                    typeof loading === "boolean" ? loading : Boolean(loading)
                }
            >
                {allRows.length === 0 ? (
                    <Empty
                        description={
                            (typeof locale?.emptyText === "string"
                                ? locale.emptyText
                                : "No data") as React.ReactNode
                        }
                    />
                ) : (
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: token.marginXS,
                        }}
                    >
                        {sliced.map((row, idx) => {
                            const realIndex =
                                (current - 1) * pageSize + idx;
                            const rowProps = onRow?.(row, realIndex);
                            return (
                                <MobileRowCard<T>
                                    key={rowKeyOf(row, realIndex, rowKey)}
                                    row={row}
                                    index={realIndex}
                                    primaryCol={primaryCol}
                                    bodyCols={bodyCols}
                                    onClick={
                                        rowProps?.onClick as
                                            | React.MouseEventHandler<HTMLDivElement>
                                            | undefined
                                    }
                                />
                            );
                        })}
                    </div>
                )}
            </Spin>
            {paginationEnabled && allRows.length > pageSize ? (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Pagination
                        current={current}
                        pageSize={pageSize}
                        total={paginationObj.total ?? allRows.length}
                        showSizeChanger={paginationObj.showSizeChanger}
                        onChange={handlePageChange}
                        simple
                    />
                </div>
            ) : null}
        </div>
    );
}

function MobileRowCard<T>({
    row,
    index,
    primaryCol,
    bodyCols,
    onClick,
}: {
    row: T;
    index: number;
    primaryCol?: ResponsiveColumnType<T>;
    bodyCols: ResponsiveColumnType<T>[];
    onClick?: React.MouseEventHandler<HTMLDivElement>;
}) {
    const { token } = theme.useToken();
    const [expanded, setExpanded] = useState(false);
    return (
        <div
            role="row"
            onClick={onClick}
            style={{
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadius,
                padding: token.paddingSM,
                cursor: onClick ? "pointer" : undefined,
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: token.marginXS,
                }}
            >
                <div style={{ flex: 1, minWidth: 0 }}>
                    {primaryCol ? resolveValue(primaryCol, row, index) : null}
                </div>
                {bodyCols.length > 0 ? (
                    <Button
                        type="text"
                        size="small"
                        icon={expanded ? <UpOutlined /> : <DownOutlined />}
                        aria-label={expanded ? "Hide details" : "Show details"}
                        onClick={(e) => {
                            e.stopPropagation();
                            setExpanded((v) => !v);
                        }}
                    />
                ) : null}
            </div>
            {expanded && bodyCols.length > 0 ? (
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: token.marginXXS,
                        marginTop: token.marginXS,
                        paddingTop: token.marginXS,
                        borderTop: `1px solid ${token.colorBorderSecondary}`,
                    }}
                >
                    {bodyCols.map((col, ci) => {
                        const labelNode = col.title as React.ReactNode;
                        const hasLabel =
                            labelNode !== undefined &&
                            labelNode !== null &&
                            labelNode !== "";
                        const value = resolveValue(col, row, index);
                        return (
                            <div
                                key={String(col.key ?? col.dataIndex ?? ci)}
                                style={{
                                    display: "flex",
                                    gap: token.marginXS,
                                    flexWrap: "wrap",
                                    alignItems: "baseline",
                                }}
                            >
                                {hasLabel ? (
                                    <Text
                                        type="secondary"
                                        style={{ minWidth: 120 }}
                                    >
                                        {labelNode}:
                                    </Text>
                                ) : null}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    {value}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
