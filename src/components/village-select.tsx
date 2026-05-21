import { FormInstance, Select } from "antd";
import React from "react";
import { Village } from "../schemas";
// import villages from "../villages.json";

interface WatchField {
    fieldId: string | string[];
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
    onFieldChange?: (fieldId: string, value: any) => void;
    fieldId?: string;
}

export default function VillageSelect({
    value,
    onChange,
    form,
    watchFields,
    filterFields,
    syncParentFields = false,
    onFieldChange,
    fieldId,
}: VillageSelectProps) {
    const [currentVillages, setCurrentVillages] = React.useState<Village[]>([]);

    React.useEffect(() => {
        fetch("./data/villages.min.json")
            .then((res) => res.json())
            .then(setCurrentVillages);
    }, []);
    // const currentVillages = villages as Village[];

    const handleVillageChange = async (selectedValue: string) => {
        onChange?.(selectedValue);

        if (!selectedValue) {
            onFieldChange?.(fieldId!, undefined);
            for (const { fieldId: wfId } of watchFields) {
                const ids = Array.isArray(wfId) ? wfId : [wfId];
                for (const id of ids) {
                    form.setFieldValue(id, undefined);
                    onFieldChange?.(id, undefined);
                }
            }
            if (filterFields) {
                for (const f of filterFields) {
                    form.setFieldValue(f, undefined);
                    onFieldChange?.(f, undefined);
                }
            }
            return;
        }

        if (syncParentFields) {
            try {
                const selectedVillage = currentVillages?.find(
                    ({ village_id, village_name }) =>
                        `${village_id}(${village_name})` === selectedValue,
                );
                if (selectedVillage) {
                    const districtUpdates = Array.isArray(
                        watchFields[0].fieldId,
                    )
                        ? watchFields[0].fieldId
                        : [watchFields[0].fieldId];

                    const subUpdates = Array.isArray(watchFields[1].fieldId)
                        ? watchFields[1].fieldId
                        : [watchFields[1].fieldId];

                    const parishUpdates = Array.isArray(watchFields[2].fieldId)
                        ? watchFields[2].fieldId
                        : [watchFields[2].fieldId];

                    for (const d of districtUpdates) {
                        form.setFieldValue(d, selectedVillage.District);
                    }
                    for (const s of subUpdates) {
                        form.setFieldValue(s, selectedVillage.subcounty_name);
                    }
                    for (const p of parishUpdates) {
                        form.setFieldValue(p, selectedVillage.parish_name);
                    }
                    if (filterFields) {
                        for (const f of filterFields) {
                            form.setFieldValue(f, selectedValue);
                        }
                    }

                    if (fieldId) {
                        onFieldChange?.(fieldId, selectedValue);
                    }
                    for (const d of districtUpdates) {
                        onFieldChange?.(d, selectedVillage.District);
                    }
                    for (const s of subUpdates) {
                        onFieldChange?.(s, selectedVillage.subcounty_name);
                    }
                    for (const p of parishUpdates) {
                        onFieldChange?.(p, selectedVillage.parish_name);
                    }
                }
            } catch (error) {
                console.error("Failed to sync parent fields:", error);
            }
        } else if (fieldId) {
            onFieldChange?.(fieldId, selectedValue);
        }
    };

    return (
        <Select
            placeholder="Select Village"
            value={value}
            onChange={handleVillageChange}
            options={currentVillages?.map((v) => {
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
                filterOption: (input, option) => {
                    const allInputs = input
                        .split(" ")
                        .map((part) => part.trim().toLowerCase());
                    return allInputs.every((part) => {
                        return option?.label.toLowerCase().includes(part);
                    });
                },
            }}
            virtual
            allowClear
            style={{ width: "100%" }}
        />
    );
}
