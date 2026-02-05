import { FormInstance, Select } from "antd";
import { useLiveQuery } from "dexie-react-hooks";
import React, { useState } from "react";
import { Village } from "../schemas";
import { db } from "../db";

interface WatchField {
    fieldId: string;
    label: string;
}

interface VillageSelectProps {
    value?: string;
    onChange?: (value: string) => void;
    form: FormInstance<any>;
    watchFields: WatchField[];
    filterFields?: string[];
    sortField?: keyof Village;
    allowDirectSearch?: boolean;
    syncParentFields?: boolean;
}

export default function VillageSelect({
    value,
    onChange,
    form,
    watchFields,
    filterFields,
    sortField = "village_name",
    allowDirectSearch = false,
    syncParentFields = false,
}: VillageSelectProps) {
    const [searchMode, setSearchMode] = useState(true);

    const villages = useLiveQuery(async () => {
        return await db.villages.orderBy(sortField).toArray();
    }, [allowDirectSearch, searchMode, sortField]);

    const getPlaceholder = () => {
        return "Select Village";
    };
    const handleVillageChange = async (selectedValue: string) => {
        onChange?.(selectedValue);

        if (syncParentFields && selectedValue) {
            try {
                const selectedVillage = villages?.find(
                    ({ village_id, village_name }) =>
                        `${village_id}(${village_name})` === selectedValue,
                );

                if (selectedVillage && filterFields) {
                    filterFields.forEach((field, idx) => {
                        if (watchFields[idx]) {
                            const fieldValue =
                                selectedVillage[
                                    field as keyof typeof selectedVillage
                                ];
                            form.setFieldValue(
                                watchFields[idx].fieldId,
                                fieldValue,
                            );
                        }
                    });
                    setSearchMode(false);
                } else if (selectedVillage && !filterFields) {
                    if (watchFields.length === 3) {
                        form.setFieldValue(
                            watchFields[0].fieldId,
                            selectedVillage.District,
                        );
                        form.setFieldValue(
                            watchFields[1].fieldId,
                            selectedVillage.subcounty_name,
                        );
                        form.setFieldValue(
                            watchFields[2].fieldId,
                            selectedVillage.parish_name,
                        );
                    } else if (watchFields.length === 2) {
                        form.setFieldValue(
                            watchFields[0].fieldId,
                            selectedVillage.District,
                        );
                        form.setFieldValue(
                            watchFields[1].fieldId,
                            selectedVillage.subcounty_name,
                        );
                    } else if (watchFields.length === 1) {
                        form.setFieldValue(
                            watchFields[0].fieldId,
                            selectedVillage.District,
                        );
                    }
                    setSearchMode(false);
                }
            } catch (error) {
                console.error("Failed to sync parent fields:", error);
            }
        }
    };

    return (
        <Select
            placeholder={getPlaceholder()}
            value={value}
            onChange={handleVillageChange}
            options={villages?.map((v) => {
                const {
                    District,
                    subcounty_name,
                    parish_name,
                    village_id,
                    village_name,
                } = v;
                return {
                    value: `${village_id}(${village_name})`,
                    label: [village_name, parish_name, subcounty_name, District]
                        .filter(Boolean)
                        .join("/"),
                };
            })}
            showSearch={{
                filterOption: (input, option) =>
                    String(option?.label ?? "")
                        .toLowerCase()
                        .includes(input.toLowerCase()),
            }}
            virtual
            style={{ width: "100%" }}
        />
    );
}
