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

    const openModal = useCallback(
        (modalData: T, enrollment: FlattenedEnrollment) => {
            setData(modalData);
            setEnrollment(enrollment);
            setIsOpen(true);
        },
        [],
    );

    const closeModal = useCallback(() => {
        setIsOpen(false);
        setData(null);
    }, []);

    const updateData = useCallback((updater: (prev: T | null) => T | null) => {
        setData(updater);
    }, []);

    return {
        data,
        enrollment,
        isOpen,
        openModal,
        closeModal,
        updateData,
    };
}
