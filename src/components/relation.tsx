import { and, eq, useLiveSuspenseQuery } from "@tanstack/react-db";
import { Form } from "antd";
import React, { useMemo } from "react";
import { EventContext, SyncContext } from "../machines";
import { RootRoute } from "../routes/__root";
import { FlattenedEvent, FlattenedTrackedEntity } from "../schemas";
import BasicForm from "./basic-form";

export default function Relation({
    section,
    mainEvent,
    trackedEntity,
}: {
    section: string;
    mainEvent: FlattenedEvent;
    trackedEntity: FlattenedTrackedEntity;
}) {
    const { program, programRuleVariables, programRules } =
        RootRoute.useLoaderData();
    const { eventsCollection, enrollmentsCollection } = SyncContext.useSelector(
        (a) => ({
            eventsCollection: a.context.eventsCollection,
            enrollmentsCollection: a.context.enrollmentsCollection,
        }),
    );

    const [form] = Form.useForm();
    const [stage] = program.programStages.filter(
        ({ id }) => id === "K2nxbE9ubSs",
    );

    const mainStageDataElements = useMemo(
        () =>
            new Set(
                stage?.programStageDataElements.map(
                    (psde) => psde.dataElement.id,
                ) ?? [],
            ),
        [stage],
    );

    const { data: childEvent } = useLiveSuspenseQuery(
        (q) =>
            q
                .from({ events: eventsCollection })
                .where(({ events }) =>
                    and(
                        eq(events.parentEvent, mainEvent.event),
                        eq(events.trackedEntity, trackedEntity.trackedEntity),
                    ),
                )
                .findOne(),
        [trackedEntity.trackedEntity, mainEvent.event],
    );

    const { data: enrollment } = useLiveSuspenseQuery(
        (q) =>
            q
                .from({ enrollment: enrollmentsCollection })
                .where(({ enrollment }) =>
                    eq(enrollment.trackedEntity, trackedEntity.trackedEntity),
                )
                .findOne(),
        [trackedEntity.trackedEntity],
    );

    if (!childEvent || !enrollment) return null;
    return (
        <EventContext.Provider
            options={{
                input: {
                    programRules,
                    programRuleVariables,
                    enrollment: enrollment,
                    event: childEvent,
                    program: "ueBhWkWll5v",
                    programStage: "K2nxbE9ubSs",
                    trackedEntity,
                    validDataElements: mainStageDataElements,
                    form,
                    eventsCollection,
                },
            }}
        >
            <BasicForm form={form} section={section} />
        </EventContext.Provider>
    );
}
