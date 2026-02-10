import { Tabs } from "antd";
import { useLiveQuery } from "dexie-react-hooks";
import React from "react";
import { db } from "../db";
import { FlattenedEvent, FlattenedTrackedEntity } from "../schemas";
import Relation from "./relation";

const getChildLabel = (to: FlattenedTrackedEntity["attributes"]): string => {
    const firstName = to["KSq9EyZ8ZFi"];
    const surname = to["TWPNbc9O2nK"];
    const dob = to["Y3DE5CZWySr"];
    return `${firstName || "Unknown"} ${surname || ""} (${dob || "No DOB"})`.trim();
};

export default function RelationshipEvent({
    section,
    trackedEntity,
    mainEvent,
}: {
    section: string;
    trackedEntity: FlattenedTrackedEntity;
    mainEvent: FlattenedEvent;
}) {
    const children = useLiveQuery(async () => {
        return db.trackedEntities
            .where("parentEntity")
            .equals(trackedEntity.trackedEntity)
            .toArray();
    }, [trackedEntity.trackedEntity]);

    if (!children || children.length === 0) {
        return null;
    }

    return (
        <Tabs
            items={children.map((trackedEntity) => {
                return {
                    key: trackedEntity.trackedEntity,
                    label: getChildLabel(trackedEntity.attributes),
                    destroyOnHidden: true,
                    children: (
                        <Relation
                            key={trackedEntity.trackedEntity}
                            section={section}
                            mainEvent={mainEvent}
														trackedEntity={trackedEntity}
                        />
                    ),
                };
            })}
        />
    );
}
