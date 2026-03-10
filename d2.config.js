/** @type {import('@dhis2/cli-app-scripts').D2Config} */
const config = {
    type: "app",
    pwa: { enabled: true },
    entryPoints: {
        app: "./src/App.tsx",
    },
};

module.exports = config;
