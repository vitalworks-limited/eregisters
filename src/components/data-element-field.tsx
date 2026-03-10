import {
    Checkbox,
    Col,
    DatePicker,
    Form,
    FormInstance,
    Input,
    InputNumber,
    Radio,
    Select,
    DatePickerProps,
} from "antd";
import React, { useCallback } from "react";
import {
    DataElement,
    Message,
    OptionSet,
    RenderType,
    TrackedEntityAttribute,
} from "../schemas";
import { createGetValueProps, createNormalize, isDate } from "../utils/utils";
import DobPicker from "./dob-picker";
import VillageSelect from "./village-select";
import { FlattenedEvent, FlattenedTrackedEntity } from "../schemas";

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
        // Stable filter function for Select dropdowns
        const filterOption = useCallback((input: string, option: any) => {
            if (!option) return false;
            return (
                option.name.toLowerCase().includes(input.toLowerCase()) ||
                option.code.toLowerCase().includes(input.toLowerCase())
            );
        }, []);

        let element: React.ReactNode = (
            <Input
                disabled={disabled}
                onChange={(e) => {
                    onFieldChange(dataElement.id, e.target.value);
                }}
                allowClear
            />
        );

        if (dataElement.id === "oTI0DLitzFY") {
            element = (
                <VillageSelect
                    form={form}
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
                    watchFields={[
                        { fieldId: "lpAaZa1cKCB", label: "District" },
                        {
                            fieldId: "lqbqW3iYmKl",
                            label: "Subcounty",
                        },
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
                    watchFields={[
                        { fieldId: "sOBCVNIm1kX", label: "District" },
                        {
                            fieldId: "qbxJxuZCyKu",
                            label: "Subcounty",
                        },
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
                    disabled={disabled}
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
            // Use callback-based approach instead of Form.useWatch
            // This prevents unnecessary re-renders and improves radio button responsiveness
            const handleRadioChange = useCallback(
                (e: any) => {
                    const value = e.target.value;
                    onFieldChange(dataElement.id, value);
                },
                [dataElement.id, onFieldChange],
            );

            const handleRadioClick = useCallback(
                (code: string) => (e: any) => {
                    // Allow clicking selected radio to deselect it
                    const currentValue = form.getFieldValue(dataElement.id);
                    if (currentValue === code) {
                        e.preventDefault();
                        e.stopPropagation();
                        onFieldChange(dataElement.id, undefined);
                    }
                },
                [dataElement.id, form, onFieldChange],
            );

            element = (
                <Radio.Group
                    disabled={disabled}
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
                    disabled={disabled}
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
                    disabled={disabled}
                    onChange={(e) => {
                        const value = e.target.checked;
                        onFieldChange(dataElement.id, value);
                    }}
                >
                    {dataElement.formName ?? dataElement.name}
                </Checkbox>
            );
        } else if (dataElement.valueType === "AGE") {
            element = (
                <DobPicker
                    form={form}
                    dataElement={dataElement}
                    onFieldChange={onFieldChange}
                    disabled={disabled}
                />
            );
        } else if (dataElement.valueType === "DATETIME") {
            element = (
                <DatePicker
                    disabled={disabled}
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
                    disabled={disabled}
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
                    disabled={disabled}
                    rows={4}
                    onChange={(e) => {
                        onFieldChange(dataElement.id, e.target.value);
                    }}
                />
            );
        } else if (dataElement.valueType === "NUMBER") {
            element = (
                <InputNumber
                    disabled={disabled}
                    style={{
                        width: "100%",
                    }}
                    onChange={(value) => {
                        onFieldChange(dataElement.id, value);
                    }}
                />
            );
        } else if (dataElement.valueType === "INTEGER") {
            element = (
                <InputNumber
                    disabled={disabled}
                    precision={0}
                    style={{
                        width: "100%",
                    }}
                    parser={(value) =>
                        Number(value?.replace(/[^0-9-]/g, "")) || 0
                    }
                    onChange={(value) => {
                        onFieldChange(dataElement.id, value);
                    }}
                />
            );
        } else if (dataElement.valueType === "INTEGER_POSITIVE") {
            element = (
                <InputNumber
                    disabled={disabled}
                    precision={0}
                    min={1}
                    style={{
                        width: "100%",
                    }}
                    parser={(value) =>
                        Number(value?.replace(/[^0-9]/g, "")) || 0
                    }
                    onChange={(value) => {
                        onFieldChange(dataElement.id, value);
                    }}
                />
            );
        } else if (dataElement.valueType === "UNIT_INTERVAL") {
            element = (
                <InputNumber
                    disabled={disabled}
                    style={{
                        width: "100%",
                    }}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(value) => {
                        onFieldChange(dataElement.id, value);
                    }}
                />
            );
        } else if (dataElement.valueType === "INTEGER_ZERO_OR_POSITIVE") {
            element = (
                <InputNumber
                    disabled={disabled}
                    min={0}
                    precision={0}
                    style={{
                        width: "100%",
                    }}
                    onChange={(value) => {
                        onFieldChange(dataElement.id, value);
                    }}
                />
            );
        } else if (dataElement.valueType === "PERCENTAGE") {
            element = (
                <InputNumber
                    disabled={disabled}
                    min={0}
                    precision={1}
                    max={100}
                    style={{
                        width: "100%",
                    }}
                    onChange={(value) => {
                        onFieldChange(dataElement.id, value);
                    }}
                />
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
                            : customLabel ||
                              `${dataElement.formName || dataElement.name}`
                    }
                    name={dataElement.id}
                    required={required}
                    rules={[
                        {
                            required: required,
                            message: `${customLabel || dataElement.formName || dataElement.name} is required`,
                        },
                    ]}
                    getValueProps={createGetValueProps(dataElement.valueType)}
                    normalize={createNormalize(dataElement.valueType)}
                    extra={warnings.map((w) => w.content)}
                    help={
                        errors.length > 0
                            ? errors.map((e) => e.content).join(", ")
                            : undefined
                    }
                    validateStatus={errors.length > 0 ? "error" : undefined}
                    hasFeedback={errors.length > 0 || warnings.length > 0}
                    style={{ padding: 0, margin: 0 }}
                >
                    {element}
                </Form.Item>
            </Col>
        );
    },
);
