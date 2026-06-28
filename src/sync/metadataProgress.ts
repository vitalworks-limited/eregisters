/**
 * Module-level pub-sub for live metadata-load progress.
 *
 * Why not put this on XState context? The pullResource actor iterates
 * resources inside a single async function — we can't easily reassign
 * machine context between iterations without splitting it into one
 * substate per resource (which would invalidate the existing 64-test
 * suite the sync layer carries). A module store lets the actor emit a
 * progress value before each step and lets React subscribe via
 * `useSyncExternalStore` without dragging XState into the picture.
 *
 * Lifecycle: callers `start()` at the top of a pull, `report()` per step,
 * and `finish()` when done. The component reading the store treats
 * `phase === "idle"` as "not actively pulling" and hides itself.
 */

export type ProgressPhase = "idle" | "checking" | "pulling" | "saving" | "done" | "error";

export interface MetadataProgress {
    phase: ProgressPhase;
    steps: string[];
    current: number;
    label?: string;
    error?: string;
    startedAt?: number;
    finishedAt?: number;
}

const idleState: MetadataProgress = {
    phase: "idle",
    steps: [],
    current: 0,
};

let state: MetadataProgress = idleState;
const listeners = new Set<() => void>();

function notify() {
    for (const fn of listeners) {
        try {
            fn();
        } catch {
            // never let one bad listener kill the others
        }
    }
}

export function subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

export function getProgressSnapshot(): MetadataProgress {
    return state;
}

export function start(steps: string[]): void {
    state = {
        phase: "checking",
        steps,
        current: 0,
        label: "Preparing…",
        startedAt: Date.now(),
    };
    notify();
}

export function report(index: number, label: string): void {
    state = {
        ...state,
        phase: "pulling",
        current: index,
        label,
    };
    notify();
}

export function saving(label = "Saving…"): void {
    state = {
        ...state,
        phase: "saving",
        current: state.steps.length,
        label,
    };
    notify();
}

export function finish(): void {
    state = {
        ...state,
        phase: "done",
        current: state.steps.length,
        label: "Complete",
        finishedAt: Date.now(),
    };
    notify();
    // Auto-clear after a short delay so the next pull starts fresh.
    setTimeout(() => {
        state = idleState;
        notify();
    }, 1500);
}

export function fail(message: string): void {
    state = {
        ...state,
        phase: "error",
        error: message,
        finishedAt: Date.now(),
    };
    notify();
}

export function reset(): void {
    state = idleState;
    notify();
}

/** Human-readable labels for the canonical resource names. */
export const RESOURCE_LABELS: Record<string, string> = {
    me: "Your account",
    programs: "Program",
    programStages: "Program stages",
    dataElements: "Data elements",
    optionSets: "Option sets",
    optionGroups: "Option groups",
    attributes: "Tracked entity attributes",
    programRules: "Program rules",
    programRuleVariables: "Program rule variables",
    programIndicators: "Program indicators",
};

export function labelFor(resource: string): string {
    return RESOURCE_LABELS[resource] ?? resource;
}
