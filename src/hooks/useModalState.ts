import { useState, useCallback } from "react";
import {
    FlattenedEnrollment,
    FlattenedEvent,
    FlattenedTrackedEntity,
} from "../schemas";

export function useModalState<
    T extends FlattenedTrackedEntity | FlattenedEvent,
>() {
    const [data, setData] = useState<T | null>(null);
    const [enrollment, setEnrollment] = useState<FlattenedEnrollment | null>(
        null,
    );
    const [isOpen, setIsOpen] = useState(false);
    const [isNew, setIsNew] = useState(false);

    const openModal = useCallback(
        (modalData: T, enrollment: FlattenedEnrollment, newRecord = false) => {
            setData(modalData);
            setEnrollment(enrollment);
            setIsNew(newRecord);
            setIsOpen(true);
        },
        [],
    );

    const closeModal = useCallback(() => {
        setData(null);
        setEnrollment(null);
        setIsNew(false);
        setIsOpen(false);
    }, []);

    const updateData = useCallback((updater: (prev: T | null) => T | null) => {
        setData(updater);
    }, []);

    return {
        data,
        enrollment,
        isOpen,
        isNew,
        openModal,
        closeModal,
        updateData,
    };
}
