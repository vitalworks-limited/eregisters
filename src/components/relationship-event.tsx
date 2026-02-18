import { Tabs } from "antd";
import { useLiveQuery } from "dexie-react-hooks";
import React, { Key, useState } from "react";
import { db } from "../db";
import { FlattenedEvent, FlattenedTrackedEntity } from "../schemas";
import Relation from "./relation";
import { createEmptyEvent } from "../utils/utils";

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
    const [activeKey, setActiveKey] = useState<string>("");

    const children = useLiveQuery(async () => {
        return db.trackedEntities
            .where("parentEntity")
            .equals(trackedEntity.trackedEntity)
            .toArray();
    }, [trackedEntity.trackedEntity]);

    if (children === undefined || children.length === 0) {
        return null;
    }

    const onChange = async (activeKey: Key) => {
        const current = await db.events
            .where("parentEvent")
            .equals(mainEvent.event)
            .filter((x) => x.trackedEntity === activeKey)
            .first();

        const currentChild = children.find(
            ({ trackedEntity }) => trackedEntity === activeKey,
        );

        const childEnrollment = currentChild
            ? await db.enrollments
                  .where({ trackedEntity: currentChild.trackedEntity })
                  .first()
            : undefined;

        if (current === undefined && currentChild && childEnrollment) {
            const newEvent = createEmptyEvent({
                trackedEntity: currentChild.trackedEntity,
                program: childEnrollment.program,
                orgUnit: childEnrollment.orgUnit,
                enrollment: childEnrollment.enrollment,
                programStage: "K2nxbE9ubSs",
                dataValues: {
                    occurredAt:
                        mainEvent.dataValues["occurredAt"] ||
                        mainEvent.occurredAt,

                    UuxHHVp5CnF:
                        section === "Maternity" ? "Newborn" : "Postnatal",
                    mrKZWf2WMIC: "Child Health Services",
                },
                parentEvent: mainEvent.event,
            });
            await db.events.put(newEvent);
        }
        setActiveKey(() => String(activeKey));
    };
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
            onChange={onChange}
            accessKey={activeKey}
						activeKey={activeKey}
        />
    );
}
