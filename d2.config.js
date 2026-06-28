// fallow-ignore-file unused-file
/** @type {import('@dhis2/cli-app-scripts').D2Config} */
const config = {
    type: "app",
    pwa: { enabled: true },

    // App-specific authorities created when the bundle is installed on a
    // DHIS2 instance. Assign EREG_ADMIN through standard User Role
    // administration. Every authenticated user implicitly gets EREG_USER
    // unless an admin explicitly removes it.
    additionalAuthorities: ["EREG_USER", "EREG_ADMIN"],

    entryPoints: {
        app: "./src/App.tsx",
    },
};

module.exports = config;
