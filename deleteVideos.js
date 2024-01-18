#!/usr/bin/env node
const tsNode = require('ts-node');

tsNode.register({
    preferTsExts: true,
    transpileOnly: true,
    compilerOptions: require('./tsconfig.json').compilerOptions,
});

const main = require('./src/deleteVideos');
const generateInterfaceCheckers = require("./src/generateInterfaceCheckers");

(async () => {
    // await generateInterfaceCheckers.default();
    await main.default();
})().catch((error) => console.error(error));

