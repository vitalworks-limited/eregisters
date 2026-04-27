import { and, eq, not, useLiveSuspenseQuery } from "@tanstack/react-db";
import { Form } from "antd";
import React, { useMemo } from "react";
import { enrollmentsCollection, eventsCollection } from "../collections";
import { useMetadata } from "../hooks/useMetadata";
import { EventContext } from "../machines";
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
    const { program, programRuleVariables, programRules } = useMetadata();

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
                        not(eq(events.syncStatus, "deleted")),
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
                },
            }}
        >
            <BasicForm form={form} section={section} />
        </EventContext.Provider>
    );
}
