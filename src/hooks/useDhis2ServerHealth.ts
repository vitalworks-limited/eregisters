import { useDataEngine } from "@dhis2/app-runtime";
import { useEffect, useState } from "react";

export type Dhis2ServerStatus =
    | "checking"
    | "online"
    | "offline"
    | "server-down";

export function useDhis2ServerHealth(interval = 15000) {
    const engine = useDataEngine();
    const [status, setStatus] = useState<Dhis2ServerStatus>("checking");

    useEffect(() => {
        let cancelled = false;

        async function check() {
            if (!navigator.onLine) {
                if (!cancelled) setStatus("offline");
                return;
            }

            try {
                await engine.query({
                    ping: {
                        resource: "me",
                    },
                });

                if (!cancelled) setStatus("online");
            } catch {
                if (!cancelled) setStatus("server-down");
            }
        }

        check();

        const timer = window.setInterval(check, interval);

        window.addEventListener("online", check);
        window.addEventListener("offline", check);

        return () => {
            cancelled = true;
            clearInterval(timer);
            window.removeEventListener("online", check);
            window.removeEventListener("offline", check);
        };
    }, [engine, interval]);

    return status;
}
