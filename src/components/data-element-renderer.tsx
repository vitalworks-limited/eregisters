import { FormInstance } from "antd";
import dayjs from "dayjs";
import { orderBy } from "lodash";
import React from "react";
import { RootRoute } from "../routes/__root";
import { ProgramRuleResult } from "../schemas";
import { buildCurrentDataElements, calculateColSpan } from "../utils/utils";
import { DataElementField } from "./data-element-field";

interface DataElementRendererProps {
    dataElementId: string;
    currentDataElements: ReturnType<typeof buildCurrentDataElements>;
    ruleResult: ProgramRuleResult;
    sectionLength: number;
    form: FormInstance;
    mode?: "dataElement" | "attribute";
    xl?: number;
}
export const DataElementRenderer = ({
    dataElementId,
    currentDataElements,
    ruleResult,
    sectionLength,
    form,
    mode = "dataElement",
    xl,
}: DataElementRendererProps) => {
    const { dataElements, trackedEntityAttributes, optionSets, optionGroups } =
        RootRoute.useLoaderData();

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
    const shownOptionGroups = ruleResult.shownOptionGroups[dataElementId] ?? [];
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
        finalOptions = currentOptions.map(({ code, id, name, sortOrder }) => ({
            id,
            code,
            name,
            optionSet: optionSetId,
            sortOrder,
        }));
    }
    const errors = ruleResult.errors.filter((m) => m.key === dataElementId);
    const messages = ruleResult.messages.filter((m) => m.key === dataElementId);
    const warnings = ruleResult.warnings.filter((m) => m.key === dataElementId);
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
            xl={xl ?? calculateColSpan(sectionLength, 6)}
            disabledDate={(date) => {
                if (allowFutureDate) return date.isBefore(dayjs(), "day");
                return date.isAfter(dayjs(), "day");
            }}
        />
    );
};
