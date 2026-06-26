#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Build wrapper that:
 *   1. computes the version metadata (version, build hash, build time),
 *   2. writes public/version.json,
 *   3. spawns d2-app-scripts build with DHIS2_APP_BUILD_HASH and
 *      DHIS2_APP_BUILD_TIME exported so the runtime constants in
 *      src/version.ts match the value pinned in public/version.json.
 *
 * This is required by Phase 17 of the sync performance fix: already-open
 * sessions poll public/version.json with cache-busting and trigger a
 * safe refresh when the buildHash changes.
 */

const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");

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

const publicDir = path.resolve(__dirname, "..", "public");
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(
    path.join(publicDir, "version.json"),
    JSON.stringify(versionInfo, null, 2) + "\n",
);
console.error(
    `[build] generated public/version.json { version: ${versionInfo.version}, buildHash: ${buildHash} }`,
);

const env = {
    ...process.env,
    DHIS2_APP_BUILD_HASH: buildHash,
    DHIS2_APP_BUILD_TIME: buildTime,
};

const bin = path.resolve(
    __dirname,
    "..",
    "node_modules",
    ".bin",
    process.platform === "win32" ? "d2-app-scripts.cmd" : "d2-app-scripts",
);
const args = ["build", ...process.argv.slice(2)];

const child = spawn(bin, args, { env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
