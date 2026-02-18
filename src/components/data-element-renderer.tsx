import { FormInstance } from "antd";
import { orderBy } from "lodash";
import React from "react";
import { RootRoute } from "../routes/__root";
import { ProgramRuleResult, RenderType } from "../schemas";
import { calculateColSpan } from "../utils/utils";
import { DataElementField } from "./data-element-field";

interface CurrentDataElementMeta {
    compulsory?: boolean;
    desktopRenderType?: RenderType["type"];
}

interface DataElementRendererProps {
    dataElementId: string;
    currentDataElements: Map<string, CurrentDataElementMeta>;
    ruleResult: ProgramRuleResult;
    sectionLength: number;
    form: FormInstance;
    onAutoSave: (fieldId: string, value: any) => void;
    mode?: "dataElement" | "attribute";
    xl?: number;
}

export function DataElementRenderer({
    dataElementId,
    currentDataElements,
    ruleResult,
    sectionLength,
    form,
    onAutoSave,
    mode = "dataElement",
    xl,
}: DataElementRendererProps) {
    const { dataElements, trackedEntityAttributes, optionSets, optionGroups } =
        RootRoute.useLoaderData();

    if (
        ruleResult.hiddenFields.has(dataElementId) &&
        ruleResult.shownOptionGroups[dataElementId] === undefined
    ) {
        return null;
    }

    const currentDataElement =
        mode === "attribute"
            ? trackedEntityAttributes.get(dataElementId)
            : dataElements.get(dataElementId);
    if (!currentDataElement) return null;

    if (ruleResult.hiddenSections.has(dataElementId)) return null;

    const { compulsory = false, desktopRenderType } =
        currentDataElements.get(dataElementId) ?? {};

    const optionSetId = currentDataElement.optionSet?.id ?? "";
    const hiddenOptions = ruleResult.hiddenOptions[dataElementId];
    const shownOptionGroups =
        ruleResult.shownOptionGroups[dataElementId] ?? new Set<string>();

    let finalOptions = orderBy(
        optionSets.get(optionSetId)?.flatMap((o) => {
            if (hiddenOptions?.has(o.id)) return [];
            return o;
        }),
        "sortOrder",
    );

    if (shownOptionGroups.size > 0) {
        const groupId = shownOptionGroups.values().next().value;
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
            disabled={dataElementId in ruleResult.assignments}
            key={dataElementId}
            form={form}
            xs={calculateColSpan(sectionLength, 24)}
            sm={calculateColSpan(sectionLength, 24)}
            md={calculateColSpan(sectionLength, 24)}
            lg={calculateColSpan(sectionLength, 12)}
            xl={xl ?? calculateColSpan(sectionLength, 6)}
            onAutoSave={onAutoSave}
        />
    );
}
