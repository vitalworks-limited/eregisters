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
} from "antd";
import React from "react";
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
    onAutoSave: (dataElementId: string, value: any) => void;
    desktopRenderType?: RenderType["type"];
    disabled?: boolean;
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
        onAutoSave,
        disabled = false,
    }) => {
        if (hidden) return null;
        const isTextInput =
            !dataElement.optionSetValue &&
            !["BOOLEAN", "AGE"].includes(dataElement.valueType ?? "") &&
            !isDate(dataElement.valueType);

        let element: React.ReactNode = (
            <Input
                disabled={disabled}
                onBlur={
                    isTextInput
                        ? (e) => {
                              onAutoSave(dataElement.id, e.target.value);
                          }
                        : undefined
                }
                allowClear
            />
        );
        if (dataElement.id === "oTI0DLitzFY") {
            element = (
                <VillageSelect
                    form={form}
                    watchFields={[
                        { fieldId: "XjgpfkoxffK", label: "District" },
                        {
                            fieldId: "PKuyTiVCR89",
                            label: "Subcounty",
                        },
                        { fieldId: "W87HAtUHJjB", label: "Parish" },
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
                        onAutoSave(dataElement.id, value);
                    }}
                    showSearch={{
                        filterOption: (input, option) =>
                            option
                                ? option.name
                                      .toLowerCase()
                                      .includes(input.toLowerCase()) ||
                                  option.code
                                      .toLowerCase()
                                      .includes(input.toLowerCase())
                                : false,
                    }}
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
            // Use Form.useWatch to track current value for unselect functionality
            const currentValue = Form.useWatch(dataElement.id, form);

            element = (
                <Radio.Group
                    disabled={disabled}
                    vertical={desktopRenderType === "VERTICAL_RADIOBUTTONS"}
                    value={currentValue}
                    onChange={(e) => {
                        onAutoSave(dataElement.id, e.target.value);
                    }}
                >
                    {finalOptions?.map((o) => (
                        <Radio
                            key={o.code}
                            value={o.code}
                            onClick={(e) => {
                                // Allow clicking selected radio to deselect it
                                if (currentValue === o.code) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    form.setFieldValue(
                                        dataElement.id,
                                        undefined,
                                    );
                                    onAutoSave(dataElement.id, undefined);
                                }
                            }}
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
                        onAutoSave(dataElement.id, value);
                    }}
                    showSearch={{
                        filterOption: (input, option) =>
                            option
                                ? option.name
                                      .toLowerCase()
                                      .includes(input.toLowerCase()) ||
                                  option.code
                                      .toLowerCase()
                                      .includes(input.toLowerCase())
                                : false,
                    }}
                />
            );
        } else if (dataElement.valueType === "BOOLEAN") {
            element = (
                <Checkbox
                    disabled={disabled}
                    onChange={(e) => {
                        onAutoSave(dataElement.id, e.target.checked);
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
                    onAutoSave={onAutoSave}
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
                        onAutoSave(
                            dataElement.id,
                            date
                                ? date.format("YYYY-MM-DDTHH:mm:ss")
                                : undefined,
                        );
                    }}
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
                        onAutoSave(
                            dataElement.id,
                            date ? date.format("YYYY-MM-DD") : undefined,
                        );
                    }}
                />
            );
        } else if (dataElement.valueType === "LONG_TEXT") {
            element = (
                <Input.TextArea
                    disabled={disabled}
                    rows={4}
                    onBlur={(e) => {
                        onAutoSave(dataElement.id, e.target.value);
                    }}
                />
            );
        } else if (
            ["NUMBER", "INTEGER", "INTEGER_POSITIVE"].includes(
                dataElement.valueType ?? "",
            )
        ) {
            element = (
                <InputNumber
                    disabled={disabled}
                    style={{
                        width: "100%",
                    }}
                    onBlur={(e) => {
                        onAutoSave(
                            dataElement.id,
                            e.target.value ? Number(e.target.value) : undefined,
                        );
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
