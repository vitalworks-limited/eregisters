import React from "react";
import { EventContext, eventFormMachine } from "../machines";
import { RootRoute } from "../routes/__root";
import {
    FlattenedEnrollment,
    FlattenedEvent,
    FlattenedTrackedEntity,
} from "../schemas";
import { FormInstance } from "antd";
import { SyncContext } from "../machines/sync";

export default function MainStage({
    programStageId,
    mainEvent,
    trackedEntity,
    enrollment,
    validDataElements,
    children,
    form,
}: {
    programStageId: string;
    mainEvent: FlattenedEvent;
    trackedEntity: FlattenedTrackedEntity;
    enrollment: FlattenedEnrollment;
    validDataElements: Set<string>;
    children: React.ReactNode;
    form: FormInstance;
}) {
    const { programRuleVariables, programRules, program } =
        RootRoute.useLoaderData();

    const eventsCollection = SyncContext.useSelector(
        (a) => a.context.eventsCollection,
    );

    return (
        <EventContext.Provider
            logic={eventFormMachine}
            options={{
                input: {
                    programRules,
                    programRuleVariables,
                    program: program.id,
                    programStage: programStageId,
                    event: mainEvent,
                    trackedEntity,
                    enrollment,
                    validDataElements,
                    eventsCollection,
                    form,
                },
            }}
        >
            {children}
        </EventContext.Provider>
    );
}
