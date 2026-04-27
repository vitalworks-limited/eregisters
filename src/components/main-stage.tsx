import { FormInstance } from "antd";
import React from "react";
import { useMetadata } from "../hooks/useMetadata";
import { EventContext, eventFormMachine } from "../machines";
import {
    FlattenedEnrollment,
    FlattenedEvent,
    FlattenedTrackedEntity,
} from "../schemas";

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
    const { programRuleVariables, programRules, program } = useMetadata();

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
                    form,
                },
            }}
        >
            {children}
        </EventContext.Provider>
    );
}
