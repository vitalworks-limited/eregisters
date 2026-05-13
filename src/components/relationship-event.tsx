import { and, eq, not, useLiveSuspenseQuery } from "@tanstack/react-db";
import { Flex, Tabs, Typography } from "antd";
import React, { Key, useState } from "react";
import { FlattenedEvent, FlattenedTrackedEntity } from "../schemas";
import { createEmptyEvent } from "../utils/utils";
import Relation from "./relation";

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
                and(
                    eq(trackedEntity.parentEntity, tei.trackedEntity),
                    not(eq(trackedEntity.syncStatus, "deleted")),
                ),
            ),
    );

    const { data: events } = useLiveSuspenseQuery((q) =>
        q
            .from({ event: eventsCollection })
            .where(({ event }) =>
                and(
                    eq(event.parentEvent, mainEvent.event),
                    not(eq(event.syncStatus, "deleted")),
                ),
            ),
    );
    const { data: enrollment } = useLiveSuspenseQuery((q) =>
        q
            .from({ enrollment: enrollmentsCollection })
            .where(({ enrollment }) =>
                eq(enrollment.trackedEntity, tei.trackedEntity),
            )
            .findOne(),
    );

    if (children.length === 0) {
        return null;
    }

    const onChange = async (activeKey: Key) => {
        const current = events.find((x) => x.trackedEntity === activeKey);
        const currentChild = children.find(
            ({ trackedEntity }) => trackedEntity === activeKey,
        );

        if (current === undefined && currentChild && enrollment) {
            const newEvent = createEmptyEvent({
                trackedEntity: currentChild.trackedEntity,
                program: enrollment.program,
                orgUnit: enrollment.orgUnit,
                enrollment: enrollment.enrollment,
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
            const tx = eventsCollection.insert(newEvent);
            await tx.isPersisted.promise;
        }
        setActiveKey(() => String(activeKey));
    };
    return (
        <Flex vertical gap={5}>
            <Typography.Title level={4}>Newborns</Typography.Title>
            <Tabs
                type="editable-card"
                hideAdd
                items={children.map((trackedEntity) => {
                    return {
                        key: trackedEntity.trackedEntity,
                        closeIcon: trackedEntity.syncStatus === "draft",
                        label: (
                            <Flex vertical>
                                <Typography.Text>
                                    {getChildLabel(trackedEntity.attributes)}
                                </Typography.Text>
                                <Typography.Text>
                                    {trackedEntity.syncStatus}
                                </Typography.Text>
                            </Flex>
                        ),
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
        </Flex>
    );
}
