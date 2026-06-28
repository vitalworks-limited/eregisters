import type { ThemeConfig } from "antd";

const fontFamily =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, ' +
    'Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif';

const baseTokens = {
    colorPrimary: "#1F4788",
    colorInfo: "#1F4788",
    colorSuccess: "#16A34A",
    colorWarning: "#D97706",
    colorError: "#DC2626",
    colorBorder: "#E5E7EB",
    colorBorderSecondary: "#EEF1F5",
    borderRadius: 2,
    borderRadiusLG: 2,
    borderRadiusSM: 2,
    borderRadiusXS: 2,
    boxShadow: "none",
    boxShadowSecondary: "none",
    boxShadowTertiary: "none",
    fontFamily,
    fontSize: 15,
    fontWeightStrong: 600,
    wireframe: false,
};

const baseComponents: NonNullable<ThemeConfig["components"]> = {
    Layout: {
        headerBg: "#FFFFFF",
        headerHeight: 64,
        headerPadding: "0 24px",
        bodyBg: "#F5F7FB",
        footerBg: "#FFFFFF",
        footerPadding: "8px 24px",
    },
    Table: {
        rowHoverBg: "#F8FAFC",
        headerBg: "#F9FAFB",
        headerSplitColor: "transparent",
        headerColor: "#475569",
        cellPaddingBlock: 14,
        borderColor: "#EEF1F5",
    },
    Card: {
        borderRadiusLG: 2,
        boxShadowTertiary: "none",
        headerBg: "transparent",
    },
    Modal: {
        borderRadiusLG: 2,
        headerBg: "#FFFFFF",
        contentBg: "#FFFFFF",
        boxShadow:
            "0 0 0 1px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(15, 23, 42, 0.08)",
    },
    Button: {
        controlHeight: 36,
        controlHeightLG: 44,
        controlHeightSM: 28,
        borderRadius: 2,
        borderRadiusLG: 2,
        borderRadiusSM: 2,
        fontWeight: 500,
        defaultBg: "#FFFFFF",
        defaultBorderColor: "#D1D5DB",
        primaryShadow: "none",
        defaultShadow: "none",
        dangerShadow: "none",
    },
    Input: {
        borderRadius: 2,
        borderRadiusLG: 2,
        borderRadiusSM: 2,
        activeShadow: "none",
        errorActiveShadow: "none",
        warningActiveShadow: "none",
    },
    InputNumber: {
        borderRadius: 2,
        borderRadiusLG: 2,
        borderRadiusSM: 2,
        activeShadow: "none",
    },
    Select: {
        borderRadius: 2,
        borderRadiusLG: 2,
        borderRadiusSM: 2,
    },
    DatePicker: {
        borderRadius: 2,
        borderRadiusLG: 2,
        borderRadiusSM: 2,
        activeShadow: "none",
    },
    Form: {
        itemMarginBottom: 16,
        labelFontSize: 14,
        verticalLabelPadding: "0 0 4px",
        labelColor: "#374151",
    },
    Tabs: {
        horizontalItemPadding: "12px 16px",
        cardBg: "transparent",
        itemSelectedColor: "#1F4788",
        inkBarColor: "#1F4788",
        titleFontSize: 14,
    },
    Tag: {
        defaultBg: "#F1F5F9",
        defaultColor: "#475569",
        borderRadiusSM: 2,
    },
    Drawer: {
        padding: 16,
        colorBgElevated: "#FFFFFF",
    },
    Badge: {
        textFontSize: 12,
    },
    Tooltip: {
        borderRadius: 2,
    },
    Dropdown: {
        borderRadiusLG: 2,
        controlItemBgHover: "#F1F5F9",
    },
    Divider: {
        colorSplit: "#EEF1F5",
    },
};

export const lightTheme: ThemeConfig = {
    token: {
        ...baseTokens,
        colorBgLayout: "#F5F7FB",
        colorBgContainer: "#FFFFFF",
        colorBgElevated: "#FFFFFF",
        colorTextBase: "#0F172A",
        colorTextSecondary: "#475569",
        colorTextTertiary: "#94A3B8",
        colorTextQuaternary: "#CBD5E1",
    },
    components: baseComponents,
};

export const darkTheme: ThemeConfig = {
    token: {
        ...baseTokens,
        colorPrimary: "#3B82F6",
        colorInfo: "#3B82F6",
        colorBgLayout: "#0B1220",
        colorBgContainer: "#111827",
        colorBgElevated: "#111827",
        colorBorder: "#1F2937",
        colorBorderSecondary: "#1F2937",
        colorTextBase: "#E5E7EB",
        colorTextSecondary: "#9CA3AF",
        colorTextTertiary: "#6B7280",
        colorTextQuaternary: "#4B5563",
    },
    components: baseComponents,
};

export const defaultTheme = lightTheme;
