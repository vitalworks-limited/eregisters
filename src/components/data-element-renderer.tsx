import { FormInstance } from "antd";
import dayjs from "dayjs";
import { orderBy } from "lodash";
import React from "react";
import { ProgramRuleResult } from "../schemas";
import { buildCurrentDataElements, calculateColSpan } from "../utils/utils";
import { DataElementField } from "./data-element-field";
import { useMetadata } from "../hooks/useMetadata";

interface DataElementRendererProps {
    dataElementId: string;
    currentDataElements: ReturnType<typeof buildCurrentDataElements>;
    ruleResult: ProgramRuleResult;
    sectionLength: number;
    form: FormInstance;
    onFieldChange: (fieldId: string, value: any) => void;
    mode?: "dataElement" | "attribute";
    xl?: number;
}
export const DataElementRenderer = React.memo(
    ({
        dataElementId,
        currentDataElements,
        ruleResult,
        sectionLength,
        form,
        onFieldChange,
        mode = "dataElement",
        xl,
    }: DataElementRendererProps) => {
        const {
            dataElements,
            trackedEntityAttributes,
            optionSets,
            optionGroups,
        } = useMetadata();

        // Check if field should be hidden
        const shouldHide =
            ruleResult.hiddenFields.includes(dataElementId) &&
            ruleResult.shownOptionGroups[dataElementId] === undefined;

        // If field should be hidden, check if it has a value
        // If it has a value, show it anyway (read-only or disabled)
        if (shouldHide) {
            const currentValue = form.getFieldValue(dataElementId);
            const hasValue =
                currentValue !== undefined &&
                currentValue !== null &&
                currentValue !== "";

            // If no value, hide the field completely
            if (!hasValue) {
                return null;
            }
            // If it has a value, we'll render it but make it disabled (handled below)
        }

        const currentDataElement =
            mode === "attribute"
                ? trackedEntityAttributes.get(dataElementId)
                : dataElements.get(dataElementId);

        if (!currentDataElement) return null;

        if (ruleResult.hiddenSections.includes(dataElementId)) return null;

        const {
            compulsory = false,
            desktopRenderType,
            allowFutureDate,
        } = currentDataElements.get(dataElementId) ?? {};

        const optionSetId = currentDataElement.optionSet?.id ?? "";
        const hiddenOptions = ruleResult.hiddenOptions[dataElementId];
        const shownOptionGroups =
            ruleResult.shownOptionGroups[dataElementId] ?? [];
        let finalOptions = orderBy(
            optionSets.get(optionSetId)?.flatMap((o) => {
                if (hiddenOptions?.includes(o.id)) return [];
                return o;
            }),
            "sortOrder",
        );

        if (shownOptionGroups.length > 0) {
            const groupId = shownOptionGroups[0];
            const currentOptions = optionGroups.get(groupId) ?? [];
            finalOptions = currentOptions.map(
                ({ code, id, name, sortOrder }) => ({
                    id,
                    code,
                    name,
                    optionSet: optionSetId,
                    sortOrder,
                }),
            );
        }
        const errors = ruleResult.errors.filter((m) => m.key === dataElementId);
        const messages = ruleResult.messages.filter(
            (m) => m.key === dataElementId,
        );
        const warnings = ruleResult.warnings.filter(
            (m) => m.key === dataElementId,
        );
        const isDisabled =
            dataElementId in ruleResult.assignments ||
            (ruleResult.hiddenFields.includes(dataElementId) &&
                form.getFieldValue(dataElementId));

        return (
            <DataElementField
                dataElement={currentDataElement}
                hidden={false}
                desktopRenderType={desktopRenderType}
                finalOptions={finalOptions}
                messages={messages}
                warnings={warnings}
                errors={errors}
                required={compulsory}
                disabled={isDisabled}
                key={dataElementId}
                form={form}
                xs={calculateColSpan(sectionLength, 24)}
                sm={calculateColSpan(sectionLength, 24)}
                md={calculateColSpan(sectionLength, 24)}
                lg={calculateColSpan(sectionLength, 12)}
                xl={xl ?? calculateColSpan(sectionLength, 8)}
                onFieldChange={onFieldChange}
                disabledDate={(date) => {
                    if (allowFutureDate) return date.isBefore(dayjs(), "day");
                    return date.isAfter(dayjs(), "day");
                }}
            />
        );
    },
    (prev, next) => {
        if (prev.dataElementId !== next.dataElementId) return false;
        if (prev.sectionLength !== next.sectionLength) return false;
        if (prev.currentDataElements !== next.currentDataElements) return false;
        if (prev.form !== next.form) return false;
        if (prev.onFieldChange !== next.onFieldChange) return false;
        if (prev.mode !== next.mode) return false;
        if (prev.xl !== next.xl) return false;
        if (prev.ruleResult === next.ruleResult) return true;
        // ruleResult reference changed — compare only what this field cares about
        const id = prev.dataElementId;
        const p = prev.ruleResult;
        const n = next.ruleResult;
        if (p.hiddenFields.includes(id) !== n.hiddenFields.includes(id))
            return false;
        if (p.hiddenSections.includes(id) !== n.hiddenSections.includes(id))
            return false;
        if (id in p.assignments !== id in n.assignments) return false;
        if (String(p.assignments[id]) !== String(n.assignments[id]))
            return false;
        if (p.shownOptionGroups[id] !== n.shownOptionGroups[id]) return false;
        if (p.hiddenOptions[id] !== n.hiddenOptions[id]) return false;
        const pErr = p.errors.filter((m) => m.key === id);
        const nErr = n.errors.filter((m) => m.key === id);
        if (pErr.length !== nErr.length) return false;
        const pWarn = p.warnings.filter((m) => m.key === id);
        const nWarn = n.warnings.filter((m) => m.key === id);
        if (pWarn.length !== nWarn.length) return false;
        const pMsg = p.messages.filter((m) => m.key === id);
        const nMsg = n.messages.filter((m) => m.key === id);
        if (pMsg.length !== nMsg.length) return false;
        return true;
    },
);
