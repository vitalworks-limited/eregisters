import {
    DatePicker,
    Flex,
    Form,
    FormInstance,
    InputNumber,
    Typography,
} from "antd";
import dayjs from "dayjs";
import React, { useMemo } from "react";
import { DataElement, TrackedEntityAttribute } from "../schemas";
import { createGetValueProps, createNormalize } from "../utils/utils";

function dobFromAge(now: dayjs.Dayjs, years = 0, months = 0, days = 0) {
    return now
        .subtract(years, "year")
        .subtract(months, "month")
        .subtract(days, "day");
}

function ageFromDob(now: dayjs.Dayjs, dob: dayjs.Dayjs) {
    const years = now.diff(dob, "year");
    const months = now.subtract(years, "year").diff(dob, "month");
    const days = now
        .subtract(years, "year")
        .subtract(months, "month")
        .diff(dob, "day");

    return { years, months, days };
}

const { Text } = Typography;

export default function DobPicker({
    form,
    dataElement,
    onFieldChange,
    disabled = false,
}: {
    form: FormInstance<any>;
    dataElement: DataElement | TrackedEntityAttribute;
    onFieldChange?: (dataElementId: string, value: any) => void;
    disabled?: boolean;
}) {
    // Read current DOB value from form
    const fieldValue = form.getFieldValue(dataElement.id);
    const enrolledAt = form.getFieldValue("enrolledAt");

    const dateValue = useMemo(() => {
        if (fieldValue && typeof fieldValue === "string") {
            return dayjs(fieldValue);
        }
        return fieldValue;
    }, [fieldValue]);

    const calculatedAge = useMemo(() => {
        if (dateValue && dayjs.isDayjs(dateValue) && enrolledAt) {
            return ageFromDob(dayjs(enrolledAt), dateValue);
        }
        return { years: null, months: null, days: null };
    }, [dateValue, enrolledAt]);

    const handleAgeChange = (
        newYears: number | null,
        newMonths: number | null,
        newDays: number | null,
    ) => {
        if (enrolledAt) {
            const calculatedDob = dobFromAge(
                dayjs(enrolledAt),
                newYears ?? 0,
                newMonths ?? 0,
                newDays ?? 0,
            );
            form.setFieldValue(dataElement.id, calculatedDob);
        } else {
            form.setFieldValue(dataElement.id, null);
        }
    };

    return (
        <Flex vertical gap={0}>
            <Form.Item
                name={dataElement.id}
                getValueProps={createGetValueProps(dataElement.valueType)}
                normalize={createNormalize(dataElement.valueType)}
            >
                <DatePicker
                    style={{ width: "100%" }}
                    disabled={disabled}
                    disabledDate={(d) => d && d.isAfter(dayjs())}
                />
            </Form.Item>
            <Flex gap={8} style={{ width: "100%" }}>
                <Flex gap={5} style={{ flex: 1 }} align="center">
                    <Text style={{ fontSize: 12 }}>Years</Text>
                    <InputNumber
                        min={0}
                        placeholder="Years"
                        value={calculatedAge.years ?? undefined}
                        onChange={(v) =>
                            handleAgeChange(
                                v,
                                calculatedAge.months,
                                calculatedAge.days,
                            )
                        }
                        disabled={disabled}
                        size="small"
                        style={{ width: "100%", flex: 1 }}
                    />
                </Flex>
                <Flex gap={5} style={{ flex: 1 }} align="center">
                    <Text style={{ fontSize: 12 }}>Months</Text>
                    <InputNumber
                        min={0}
                        max={11}
                        placeholder="Months"
                        value={calculatedAge.months ?? undefined}
                        onChange={(v) =>
                            handleAgeChange(
                                calculatedAge.years,
                                v,
                                calculatedAge.days,
                            )
                        }
                        disabled={disabled}
                        size="small"
                        style={{ width: "100%", flex: 1 }}
                    />
                </Flex>
                <Flex gap={5} style={{ flex: 1 }} align="center">
                    <Text style={{ fontSize: 12 }}>Days</Text>
                    <InputNumber
                        min={0}
                        max={31}
                        placeholder="Days"
                        value={calculatedAge.days ?? undefined}
                        onChange={(v) =>
                            handleAgeChange(
                                calculatedAge.years,
                                calculatedAge.months,
                                v,
                            )
                        }
                        disabled={disabled}
                        size="small"
                        style={{ width: "100%", flex: 1 }}
                    />
                </Flex>
            </Flex>
        </Flex>
    );
}
