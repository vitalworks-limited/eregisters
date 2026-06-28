import React from "react";

/**
 * Tiny context the patients route uses to let the child index expose a
 * "Register new patient" button next to its search results, while the
 * registration modal itself stays mounted on the parent route. The
 * parent provides the `open` callback; the child consumes it.
 */
export const PatientRegistrationContext = React.createContext<
    (() => void) | undefined
>(undefined);

export function usePatientRegistrationTrigger(): (() => void) | undefined {
    return React.useContext(PatientRegistrationContext);
}
