import { useState, useCallback } from "react";

export function useModalState<T>() {
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
