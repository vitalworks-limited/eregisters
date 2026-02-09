import { Tabs } from "antd";
import { useLiveQuery } from "dexie-react-hooks";
import React from "react";
import { db } from "../db";
import {
    FlattenedEvent,
    FlattenedRelationship,
    FlattenedTrackedEntity,
} from "../schemas";
import Relation from "./relation";

const getChildLabel = (to: FlattenedRelationship["to"]): string => {
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
    const relationships = useLiveQuery(async () => {
        return db.relationships
            .where("fromId")
            .equals(trackedEntity.trackedEntity)
            .toArray();
    }, [trackedEntity.trackedEntity]);

    if (!relationships || relationships.length === 0) {
        return null;
    }

    return (
        <Tabs
            items={relationships.map((relationship) => {
                const child = relationship.to;
                return {
                    key: relationship.relationship,
                    label: getChildLabel(child),
                    destroyInactiveTabPane: false,
                    children: (
                        <Relation
                            key={relationship.relationship}
                            section={section}
                            child={child}
                            mainEvent={mainEvent}
                        />
                    ),
                };
            })}
        />
    );
}
