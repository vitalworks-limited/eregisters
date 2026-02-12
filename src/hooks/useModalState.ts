import { useState, useCallback } from "react";
import { FlattenedEvent, FlattenedTrackedEntity } from "../schemas";

export function useModalState<T extends FlattenedTrackedEntity | FlattenedEvent>() {
    const [data, setData] = useState<T | null>(null);
    const [isOpen, setIsOpen] = useState(false);

    const openModal = useCallback((modalData: T) => {
        setData(modalData);
        setIsOpen(true);
    }, []);

    const closeModal = useCallback(() => {
        setIsOpen(false);
        setData(null);
    }, []);

    const updateData = useCallback((updater: (prev: T | null) => T | null) => {
        setData(updater);
    }, []);

    return {
        data,
        isOpen,
        openModal,
        closeModal,
        updateData,
    };
}
