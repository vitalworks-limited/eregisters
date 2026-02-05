import { Tabs } from "antd";
import dayjs from "dayjs";
import { useLiveQuery } from "dexie-react-hooks";
import React from "react";
import { populateRelationshipsForEntity } from "../db/operations";
import {
    FlattenedEvent,
    FlattenedRelationship,
    FlattenedTrackedEntity,
} from "../schemas";
import Relation from "./relation";

const getChildLabel = (to: FlattenedRelationship["to"]): string => {
    const nameAttr = to.fields["P6Kp91wfCWy"];
    const birthDateAttr = to.fields["Y3DE5CZWySr"];

    if (nameAttr) {
        return nameAttr;
    }

    if (birthDateAttr) {
        return `Born ${dayjs(birthDateAttr).format("MMM DD, YYYY")}`;
    }

    return `Child ${dayjs().format("MMM DD")}`;
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
        if (!trackedEntity.trackedEntity) return [];

        try {
            return await populateRelationshipsForEntity(
                trackedEntity.trackedEntity,
            );
        } catch (error) {
            console.error("Failed to load relationships:", error);
            return [];
        }
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
                            key={child.id}
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
