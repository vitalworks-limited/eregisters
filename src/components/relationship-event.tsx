import { and, eq, not, useLiveSuspenseQuery } from "@tanstack/react-db";
import { Flex, Tabs, Typography } from "antd";
import React, { Key, useState } from "react";
import { FlattenedEvent, FlattenedTrackedEntity } from "../schemas";
import { createEmptyEvent } from "../utils/utils";
import Relation from "./relation";

import { SyncContext } from "../machines";

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
    const {
        enrollmentsCollection,
        trackedEntitiesCollection,
        eventsCollection,
    } = SyncContext.useSelector((a) => ({
        enrollmentsCollection: a.context.enrollmentsCollection,
        trackedEntitiesCollection: a.context.trackedEntitiesCollection,
        eventsCollection: a.context.eventsCollection,
    }));

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
                styles={{
                    // root: {
                    //     background: "#fff",
                    //     borderRadius: 12,
                    //     padding: 8,
                    // },
                    // header: {
                    //     marginBottom: 8,
                    //     background: "#f5f5f5",
                    //     borderRadius: 10,
                    //     padding: 6,
                    // },
                    // item: {
                    //     padding: "12px 18px",
                    //     fontSize: 15,
                    //     fontWeight: 600,
                    //     borderRadius: 8,
                    // },
                    // indicator: {
                    //     height: 3,
                    //     borderRadius: 999,
                    // },
                    // content: {
                    //     padding: 12,
                    //     background: "#fff",
                    //     borderRadius: 10,
                    //     border: "1px solid #f0f0f0",
                    // },
                }}
                items={children.map((trackedEntity) => {
                    return {
                        key: trackedEntity.trackedEntity,
												closeIcon:trackedEntity.syncStatus === "draft",
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
