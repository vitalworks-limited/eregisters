import {
    Checkbox,
    Col,
    DatePicker,
    DatePickerProps,
    Form,
    FormInstance,
    Input,
    InputNumber,
    Radio,
    Select,
} from "antd";
import React, { CSSProperties, useCallback } from "react";
import {
    DataElement,
    FlattenedEvent,
    FlattenedTrackedEntity,
    Message,
    OptionSet,
    RenderType,
    TrackedEntityAttribute,
} from "../schemas";
import { createGetValueProps, createNormalize, isDate } from "../utils/utils";
import DobPicker from "./dob-picker";
import VillageSelect from "./village-select";

// Fields auto-populated by VillageSelect cascade — must not be manually edited
const VILLAGE_CASCADED_FIELDS = new Set([
    "XjgpfkoxffK",
    "lpAaZa1cKCB",
    "sOBCVNIm1kX", // District
    "PKuyTiVCR89",
    "lqbqW3iYmKl",
    "qbxJxuZCyKu", // Subcounty
    "W87HAtUHJjB",
    "BiergDUeQra",
    "SjvgaRn8m7Y", // Parish
]);

const commonCSS: CSSProperties = { width: "100%" };
const zeroParser = (displayValue: string | undefined) =>
    Number(displayValue?.replace(/[^0-9]/g, "")) || 0;

export const DataElementField = React.memo<{
    dataElement: DataElement | TrackedEntityAttribute;
    hidden: boolean;
    finalOptions?: OptionSet["options"];
    errors: Array<Message>;
    messages: Array<Message>;
    warnings: Array<Message>;
    required: boolean;
    sm?: number;
    lg?: number;
    span?: number;
    md?: number;
    xs?: number;
    xl?: number;
    form: FormInstance<FlattenedTrackedEntity | FlattenedEvent>;
    customLabel?: string;
    onFieldChange: (dataElementId: string, value: any) => void;
    desktopRenderType?: RenderType["type"];
    disabled?: boolean;
    disabledDate?: DatePickerProps["disabledDate"];
}>(
    ({
        dataElement,
        hidden,
        finalOptions,
        errors,
        warnings,
        required,
        sm,
        lg,
        md,
        xs,
        xl,
        form,
        customLabel,
        desktopRenderType,
        onFieldChange,
        disabledDate,
        disabled = false,
    }) => {
        if (hidden) return null;
        const isDisabled =
            disabled || VILLAGE_CASCADED_FIELDS.has(dataElement.id);
        const filterOption = useCallback((input: string, option: any) => {
            if (!option) return false;
            return (
                option.name.toLowerCase().includes(input.toLowerCase()) ||
                option.code.toLowerCase().includes(input.toLowerCase())
            );
        }, []);

        let element: React.ReactNode = (
            <Input
                disabled={isDisabled}
                onBlur={(e) => {
                    onFieldChange(dataElement.id, e.target.value);
                }}
                allowClear
            />
        );

        if (dataElement.id === "oTI0DLitzFY") {
            element = (
                <VillageSelect
                    form={form}
                    fieldId={dataElement.id}
                    onFieldChange={onFieldChange}
                    watchFields={[
                        {
                            fieldId: [
                                "XjgpfkoxffK",
                                "lpAaZa1cKCB",
                                "sOBCVNIm1kX",
                            ],
                            label: "District",
                        },
                        {
                            fieldId: [
                                "PKuyTiVCR89",
                                "lqbqW3iYmKl",
                                "qbxJxuZCyKu",
                            ],
                            label: "Subcounty",
                        },
                        {
                            fieldId: [
                                "W87HAtUHJjB",
                                "BiergDUeQra",
                                "SjvgaRn8m7Y",
                            ],
                            label: "Parish",
                        },
                    ]}
                    syncParentFields
                    allowDirectSearch
                    sortField="village_name"
                    filterFields={["pixScollYA6", "YoteNDkoIwM"]}
                />
            );
        } else if (dataElement.id === "pixScollYA6") {
            element = (
                <VillageSelect
                    form={form}
                    fieldId={dataElement.id}
                    onFieldChange={onFieldChange}
                    watchFields={[
                        { fieldId: "lpAaZa1cKCB", label: "District" },
                        { fieldId: "lqbqW3iYmKl", label: "Subcounty" },
                        { fieldId: "BiergDUeQra", label: "Parish" },
                    ]}
                    syncParentFields
                    allowDirectSearch
                    sortField="village_name"
                />
            );
        } else if (dataElement.id === "YoteNDkoIwM") {
            element = (
                <VillageSelect
                    form={form}
                    fieldId={dataElement.id}
                    onFieldChange={onFieldChange}
                    watchFields={[
                        { fieldId: "sOBCVNIm1kX", label: "District" },
                        { fieldId: "qbxJxuZCyKu", label: "Subcounty" },
                        { fieldId: "SjvgaRn8m7Y", label: "Parish" },
                    ]}
                    syncParentFields
                    allowDirectSearch
                    sortField="village_name"
                />
            );
        } else if (
            dataElement.optionSetValue &&
            dataElement.optionSet &&
            dataElement.valueType === "MULTI_TEXT"
        ) {
            element = (
                <Select
                    disabled={isDisabled}
                    style={{ width: "100%" }}
                    options={finalOptions}
                    fieldNames={{
                        label: "name",
                        value: "code",
                    }}
                    allowClear
                    mode="multiple"
                    onChange={(value) => {
                        onFieldChange(dataElement.id, value);
                    }}
                    showSearch={{ filterOption }}
                />
            );
        } else if (
            dataElement.optionSetValue &&
            dataElement.optionSet &&
            desktopRenderType &&
            ["VERTICAL_RADIOBUTTONS", "HORIZONTAL_RADIOBUTTONS"].includes(
                desktopRenderType,
            )
        ) {
            const handleRadioChange = useCallback(
                (e: any) => {
                    onFieldChange(dataElement.id, e.target.value);
                },
                [dataElement.id, onFieldChange],
            );

            const handleRadioClick = useCallback(
                (code: string) => () => {
                    const currentValue = form.getFieldValue(dataElement.id);
                    if (currentValue === code) {
                        form.setFieldValue(dataElement.id, undefined);
                        onFieldChange(dataElement.id, undefined);
                    }
                },
                [dataElement.id, form, onFieldChange],
            );

            element = (
                <Radio.Group
                    disabled={isDisabled}
                    vertical={desktopRenderType === "VERTICAL_RADIOBUTTONS"}
                    onChange={handleRadioChange}
                >
                    {finalOptions?.map((o) => (
                        <Radio
                            key={o.code}
                            value={o.code}
                            onClick={handleRadioClick(o.code)}
                        >
                            {o.name}
                        </Radio>
                    ))}
                </Radio.Group>
            );
        } else if (dataElement.optionSetValue && dataElement.optionSet) {
            element = (
                <Select
                    disabled={isDisabled}
                    style={{ width: "100%" }}
                    options={finalOptions}
                    fieldNames={{
                        label: "name",
                        value: "code",
                    }}
                    allowClear
                    onChange={(value) => {
                        onFieldChange(dataElement.id, value);
                    }}
                    showSearch={{ filterOption }}
                />
            );
        } else if (dataElement.valueType === "BOOLEAN") {
            element = (
                <Checkbox
                    disabled={isDisabled}
                    onChange={(e) => {
                        const value = e.target.checked;
                        onFieldChange(dataElement.id, value);
                    }}
                >
                    {dataElement.formName ?? dataElement.name}
                </Checkbox>
            );
        } else if (dataElement.valueType === "DATETIME") {
            element = (
                <DatePicker
                    disabled={isDisabled}
                    style={{
                        width: "100%",
                    }}
                    showTime
                    onChange={(date) => {
                        const value = date
                            ? date.format("YYYY-MM-DDTHH:mm:ss")
                            : undefined;
                        onFieldChange(dataElement.id, value);
                    }}
                    disabledDate={disabledDate}
                />
            );
        } else if (isDate(dataElement.valueType)) {
            element = (
                <DatePicker
                    disabled={isDisabled}
                    style={{
                        width: "100%",
                    }}
                    onChange={(date) => {
                        const value = date
                            ? date.format("YYYY-MM-DD")
                            : undefined;
                        onFieldChange(dataElement.id, value);
                    }}
                    disabledDate={disabledDate}
                />
            );
        } else if (dataElement.valueType === "LONG_TEXT") {
            element = (
                <Input.TextArea
                    disabled={isDisabled}
                    rows={4}
                    onBlur={(e) => {
                        onFieldChange(dataElement.id, e.target.value);
                    }}
                />
            );
        } else if (dataElement.valueType === "NUMBER") {
            element = (
                <InputNumber
                    disabled={isDisabled}
                    style={{
                        width: "100%",
                    }}
                    onBlur={(e) => {
                        onFieldChange(dataElement.id, e.target.value);
                    }}
                />
            );
        } else if (dataElement.valueType === "INTEGER") {
            element = (
                <InputNumber
                    disabled={isDisabled}
                    precision={0}
                    style={commonCSS}
                    parser={zeroParser}
                    onBlur={(e) => {
                        onFieldChange(dataElement.id, e.target.value);
                    }}
                />
            );
        } else if (dataElement.valueType === "INTEGER_POSITIVE") {
            element = (
                <InputNumber
                    disabled={isDisabled}
                    precision={0}
                    min={1}
                    style={commonCSS}
                    parser={zeroParser}
                    onBlur={(e) => {
                        onFieldChange(dataElement.id, e.target.value);
                    }}
                />
            );
        } else if (dataElement.valueType === "UNIT_INTERVAL") {
            element = (
                <InputNumber
                    disabled={isDisabled}
                    style={commonCSS}
                    min={0}
                    max={1}
                    step={0.01}
                    onBlur={(e) => {
                        onFieldChange(dataElement.id, e.target.value);
                    }}
                />
            );
        } else if (dataElement.valueType === "INTEGER_ZERO_OR_POSITIVE") {
            element = (
                <InputNumber
                    disabled={isDisabled}
                    min={0}
                    precision={0}
                    style={{
                        width: "100%",
                    }}
                    onBlur={(e) => {
                        onFieldChange(dataElement.id, e.target.value);
                    }}
                />
            );
        } else if (dataElement.valueType === "PERCENTAGE") {
            element = (
                <InputNumber
                    disabled={isDisabled}
                    min={0}
                    precision={1}
                    max={100}
                    style={{
                        width: "100%",
                    }}
                    onBlur={(e) => {
                        onFieldChange(dataElement.id, e.target.value);
                    }}
                />
            );
        }

        if (dataElement.valueType === "AGE") {
            return (
                <Col
                    key={dataElement.id}
                    sm={{ span: sm }}
                    md={{ span: md }}
                    lg={{ span: lg }}
                    xs={{ span: xs }}
                    xl={{ span: xl }}
                >
                    <DobPicker
                        form={form}
                        dataElement={dataElement}
                        onFieldChange={onFieldChange}
                        label={
                            customLabel ||
                            dataElement.formName ||
                            dataElement.name
                        }
                    />
                </Col>
            );
        }

        return (
            <Col
                key={dataElement.id}
                sm={{ span: sm }}
                md={{ span: md }}
                lg={{ span: lg }}
                xs={{ span: xs }}
                xl={{ span: xl }}
            >
                <Form.Item
                    key={dataElement.id}
                    label={
                        dataElement.valueType === "BOOLEAN"
                            ? null
                            : `${
                                  customLabel ||
                                  dataElement.formName ||
                                  dataElement.name
                              }`
                    }
                    name={dataElement.id}
                    required={required}
                    tooltip={
                        required
                            ? {
                                  title: "This field is required",
                                  placement: "topLeft",
                              }
                            : undefined
                    }
                    rules={[
                        {
                            required: required,
                            message: `${customLabel || dataElement.formName || dataElement.name} is required`,
                        },
                    ]}
                    getValueProps={createGetValueProps(dataElement.valueType)}
                    normalize={createNormalize(dataElement.valueType)}
                    help={
                        [...errors, ...warnings].length > 0
                            ? [...errors, ...warnings]
                                  .map((e) => e.content)
                                  .join(", ")
                            : undefined
                    }
                    validateStatus={
                        errors.length > 0
                            ? "error"
                            : warnings.length > 0
                              ? "warning"
                              : undefined
                    }
                    hasFeedback={errors.length > 0 || warnings.length > 0}
                    style={{ padding: 0, margin: 0 }}
                >
                    {element}
                </Form.Item>
            </Col>
        );
    },
);
