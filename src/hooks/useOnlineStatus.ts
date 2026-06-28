import { useEffect, useState } from "react";

/**
 * Tiny hook around `navigator.onLine` + the online/offline window
 * events. SSR-safe — defaults to online when `navigator` is absent.
 */
export function useOnlineStatus(): boolean {
    const [online, setOnline] = useState(
        typeof navigator === "undefined" ? true : navigator.onLine,
    );
    useEffect(() => {
        const onUp = () => setOnline(true);
        const onDown = () => setOnline(false);
        window.addEventListener("online", onUp);
        window.addEventListener("offline", onDown);
        return () => {
            window.removeEventListener("online", onUp);
            window.removeEventListener("offline", onDown);
        };
    }, []);
    return online;
}
