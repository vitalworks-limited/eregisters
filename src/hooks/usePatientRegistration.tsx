import { Form } from "antd";
import React, { useCallback, useMemo } from "react";
import {
    enrollmentsCollection,
    trackedEntitiesCollection,
} from "../collections";
import { DataModal } from "../components/data-modal";
import { TrackerRegistration } from "../components/tracker-registration";
import { useModalState } from "./useModalState";
import { useMetadata } from "./useMetadata";
import { TrackedEntityContext } from "../machines";
import { FlattenedTrackedEntity } from "../schemas";
import {
    cancelDataModal,
    createEmptyEnrollment,
    createEmptyTrackedEntity,
} from "../utils/utils";

interface Options {
    onSaved?: (trackedEntityId: string) => void;
    initialAttributes?: Record<string, string>;
}

export function usePatientRegistration(options: Options = {}) {
    const { onSaved, initialAttributes = {} } = options;
    const {
        orgUnit: { id },
        programRuleVariables,
        program,
        programRules,
    } = useMetadata();

    const mainStageDataElements = useMemo(
        () =>
            new Set(
                program.programTrackedEntityAttributes.map(
                    ({ trackedEntityAttribute }) => trackedEntityAttribute.id,
                ),
            ),
        [program],
    );

    const {
        data: trackedEntity,
        enrollment,
        isOpen,
        openModal,
        closeModal,
    } = useModalState<FlattenedTrackedEntity>();

    const createAndOpen = useCallback(async () => {
        const newPatient = createEmptyTrackedEntity({
            orgUnit: id,
            attributes: initialAttributes,
        });
        const newEnrollment = createEmptyEnrollment({
            orgUnit: id,
            trackedEntity: newPatient.trackedEntity,
            attributes: initialAttributes,
        });
        await trackedEntitiesCollection.utils.insertLocally(newPatient);
        await enrollmentsCollection.utils.insertLocally(newEnrollment);
        openModal(newPatient, newEnrollment);
    }, [id, initialAttributes, openModal]);

    const modal = (
        <DataModal<FlattenedTrackedEntity>
            open={isOpen}
            data={trackedEntity}
            enrollment={enrollment}
            onClose={closeModal}
            onCancel={() => cancelDataModal(trackedEntity!)}
            onSave={async ({ values, addAnother }) => {
                if (values && trackedEntity && enrollment) {
                    const tx2 = enrollmentsCollection.update(
                        enrollment.enrollment,
                        (draft) => {
                            draft.attributes = {
                                ...enrollment.attributes,
                                ...values,
                            };
                            draft.syncStatus = "pending";
                        },
                    );
                    await tx2.isPersisted.promise;
                    const tx1 = trackedEntitiesCollection.update(
                        trackedEntity.trackedEntity,
                        (draft) => {
                            draft.attributes = {
                                ...trackedEntity.attributes,
                                ...values,
                            };
                            draft.syncStatus = "pending";
                        },
                    );
                    await tx1.isPersisted.promise;
                    if (addAnother) {
                        closeModal();
                        await createAndOpen();
                    } else {
                        onSaved?.(trackedEntity.trackedEntity);
                    }
                }
            }}
            title="Register New Client"
            submitButtonText="Register client"
            hasAddAnother
        >
            {(form) => (
                <TrackedEntityContext.Provider
                    key={trackedEntity?.trackedEntity || "closed"}
                    options={{
                        input: {
                            programRules,
                            programRuleVariables,
                            program: "ueBhWkWll5v",
                            trackedEntity: trackedEntity!,
                            validDataElements: mainStageDataElements,
                            form,
                        },
                    }}
                >
                    <Form
                        form={form}
                        layout="vertical"
                        preserve={false}
                        initialValues={trackedEntity?.attributes}
                    >
                        <TrackerRegistration
                            trackedEntity={trackedEntity!}
                            form={form}
                        />
                    </Form>
                </TrackedEntityContext.Provider>
            )}
        </DataModal>
    );

    return { openRegistration: createAndOpen, registrationModal: modal };
}
