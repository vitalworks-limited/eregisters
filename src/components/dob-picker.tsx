import { DatePicker, Flex, FormInstance, InputNumber, Typography } from "antd";
import dayjs from "dayjs";
import React, { useEffect, useState } from "react";
import { DataElement, TrackedEntityAttribute } from "../schemas";

function dobFromAge(years = 0, months = 0, days = 0) {
    return dayjs()
        .subtract(years, "year")
        .subtract(months, "month")
        .subtract(days, "day");
}

function ageFromDob(dob: dayjs.Dayjs) {
    const now = dayjs();

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
    onAutoSave,
    disabled = false,
}: {
    form: FormInstance<any>;
    dataElement: DataElement | TrackedEntityAttribute;
    onAutoSave?: (dataElementId: string, value: any) => void;
    disabled?: boolean;
}) {
    const [years, setYears] = useState<number | null>(null);
    const [months, setMonths] = useState<number | null>(null);
    const [days, setDays] = useState<number | null>(null);
    const fieldValue = form.getFieldValue(dataElement.id);
    const dateValue = fieldValue && typeof fieldValue === 'string'
        ? dayjs(fieldValue)
        : fieldValue;

    useEffect(() => {
        if (dateValue && dayjs.isDayjs(dateValue)) {
            const age = ageFromDob(dateValue);
            setYears(age.years);
            setMonths(age.months);
            setDays(age.days);
        }
    }, [dateValue?.format('YYYY-MM-DD')]);
    const handleAgeChange = (
        newYears: number | null,
        newMonths: number | null,
        newDays: number | null,
    ) => {
        setYears(newYears);
        setMonths(newMonths);
        setDays(newDays);
        const calculatedDob = dobFromAge(
            newYears ?? 0,
            newMonths ?? 0,
            newDays ?? 0,
        );
        const dobString = calculatedDob.format('YYYY-MM-DD');
        form.setFieldValue(dataElement.id, dobString);
        onAutoSave?.(dataElement.id, dobString);
    };

    const handleDateChange = (date: dayjs.Dayjs | null) => {
        if (date) {
            const age = ageFromDob(date);
            setYears(age.years);
            setMonths(age.months);
            setDays(age.days);
            const dobString = date.format('YYYY-MM-DD');
            form.setFieldValue(dataElement.id, dobString);
            onAutoSave?.(dataElement.id, dobString);
        } else {
            setYears(null);
            setMonths(null);
            setDays(null);
            form.setFieldValue(dataElement.id, null);
            onAutoSave?.(dataElement.id, null);
        }
    };

    return (
        <Flex vertical gap={8}>
            <DatePicker
                style={{ width: "100%" }}
                value={dateValue}
                onChange={handleDateChange}
                disabled={disabled}
                disabledDate={(d) => d && d.isAfter(dayjs())}
            />
            <Flex gap={8} style={{ width: "100%" }} >
                <Flex gap={5} style={{ flex: 1 }} align="center">
                    <Text style={{ fontSize: 12 }}>Years</Text>
                    <InputNumber
                        min={0}
                        placeholder="Years"
                        value={years ?? undefined}
                        onChange={(v) => handleAgeChange(v, months, days)}
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
                        value={months ?? undefined}
                        onChange={(v) => handleAgeChange(years, v, days)}
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
                        value={days ?? undefined}
                        onChange={(v) => handleAgeChange(years, months, v)}
                        disabled={disabled}
                        size="small"
                        style={{ width: "100%", flex: 1 }}
                    />
                </Flex>
            </Flex>
        </Flex>
    );
}
