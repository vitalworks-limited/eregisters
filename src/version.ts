/**
 * Build/version metadata used by the in-app update checker (Phase 17).
 *
 * Values come from environment variables injected by d2-app-scripts at
 * build time. The shell automatically exposes `DHIS2_APP_VERSION` from
 * `package.json`. `DHIS2_APP_BUILD_HASH` and `DHIS2_APP_BUILD_TIME` are
 * passed by the `prebuild`/`build` script in `package.json`.
 *
 * Fallback values keep development (`pnpm start`) running without
 * needing the env vars wired up.
 */

declare const process: { env: Record<string, string | undefined> };

/**
 * Reads a build-time env var. d2-app-scripts injects DHIS2_* values into
 * both `process.env` and `import.meta.env`; we read `process.env` only
 * to stay compatible with Jest (which doesn't expose `import.meta`).
 */
function pickEnv(key: string): string | undefined {
    try {
        if (typeof process !== "undefined" && process?.env) {
            return process.env[key];
        }
    } catch {
        // process may not exist in some browser contexts.
    }
    return undefined;
}

export const APP_NAME =
    pickEnv("DHIS2_APP_NAME") ?? pickEnv("DHIS2_APP_URL_SLUG") ?? "eregisters";

export const APP_VERSION = pickEnv("DHIS2_APP_VERSION") ?? "dev";

export const BUILD_HASH = pickEnv("DHIS2_APP_BUILD_HASH") ?? "local";

export const BUILD_TIME =
    pickEnv("DHIS2_APP_BUILD_TIME") ?? new Date(0).toISOString();

export interface VersionInfo {
    app: string;
    version: string;
    buildHash: string;
    buildTime: string;
}

export function getCurrentVersionInfo(): VersionInfo {
    return {
        app: APP_NAME,
        version: APP_VERSION,
        buildHash: BUILD_HASH,
        buildTime: BUILD_TIME,
    };
}
