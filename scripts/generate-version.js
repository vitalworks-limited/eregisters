#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Generates `public/version.json` so already-open browser sessions can
 * poll for new deployments without depending on the shell's main JS
 * bundle (which they have cached).
 *
 * Inputs (env vars, used to keep injection consistent with the runtime
 * values in `src/version.ts`):
 *   - DHIS2_APP_BUILD_HASH (default: `git rev-parse --short HEAD`)
 *   - DHIS2_APP_BUILD_TIME (default: now in UTC ISO)
 *
 * Idempotent. Safe to run before every build.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const pkg = require(path.resolve(__dirname, "..", "package.json"));

function tryGitHash() {
    try {
        return execSync("git rev-parse --short HEAD", {
            stdio: ["ignore", "pipe", "ignore"],
        })
            .toString()
            .trim();
    } catch {
        return undefined;
    }
}

const buildHash =
    process.env.DHIS2_APP_BUILD_HASH ||
    tryGitHash() ||
    `nogit-${Date.now().toString(36)}`;

const buildTime =
    process.env.DHIS2_APP_BUILD_TIME || new Date().toISOString();

const versionInfo = {
    app: pkg.name,
    version: pkg.version,
    buildHash,
    buildTime,
};

const outDir = path.resolve(__dirname, "..", "public");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "version.json");

fs.writeFileSync(outPath, JSON.stringify(versionInfo, null, 2) + "\n");

console.error(
    `[generate-version] wrote ${path.relative(process.cwd(), outPath)} ` +
        `{ version: ${versionInfo.version}, buildHash: ${buildHash} }`,
);
