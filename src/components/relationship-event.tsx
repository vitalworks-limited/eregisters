import { Tabs } from "antd";
import { eq, useLiveSuspenseQuery } from "@tanstack/react-db";
import React, { Key, useState } from "react";
import { FlattenedEvent, FlattenedTrackedEntity } from "../schemas";
import Relation from "./relation";
import { createEmptyEvent } from "../utils/utils";
import {
    enrollmentsCollection,
    eventsCollection,
    trackedEntitiesCollection,
} from "../collections";

const getChildLabel = (to: FlattenedTrackedEntity["attributes"]): string => {
    const firstName = to["KSq9EyZ8ZFi"];
    const surname = to["TWPNbc9O2nK"];
    const dob = to["Y3DE5CZWySr"];
    return `${firstName || "Unknown"} ${surname || ""} (${dob || "No DOB"})`.trim();
};

export default function RelationshipEvent({
    section,
    trackedEntity: tei,
    mainEvent,
}: {
    section: string;
    trackedEntity: FlattenedTrackedEntity;
    mainEvent: FlattenedEvent;
}) {
    const [activeKey, setActiveKey] = useState<string>("");

    const { data: children } = useLiveSuspenseQuery((q) =>
        q
            .from({ trackedEntity: trackedEntitiesCollection })
            .where(({ trackedEntity }) =>
                eq(trackedEntity.parentEntity, tei.trackedEntity),
            ),
    );

    const { data: events } = useLiveSuspenseQuery((q) =>
        q
            .from({ event: eventsCollection })
            .where(({ event }) => eq(event.parentEvent, mainEvent.event)),
    );
    const { data: enrollments } = useLiveSuspenseQuery((q) =>
        q.from({ enrollment: enrollmentsCollection }),
    );

    if (children.length === 0) {
        return null;
    }

    const onChange = async (activeKey: Key) => {
        const current = events.find((x) => x.trackedEntity === activeKey);

        const currentChild = children.find(
            ({ trackedEntity }) => trackedEntity === activeKey,
        );

        const childEnrollment = currentChild
            ? enrollments.find(
                  (e) => e.trackedEntity === currentChild.trackedEntity,
              )
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
            const tx = eventsCollection.insert({
                ...newEvent,
                syncStatus: "pending",
            });
            await tx.isPersisted.promise;
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
