"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const provider_js_1 = require("./provider.js");
const catalog_js_1 = require("../provider/catalog.js");
async function activate(context) {
    const version = context.extension.packageJSON.version;
    console.log(`[Magpie Relay v${version}] Extension activating...`);
    // Register the language model provider
    (0, provider_js_1.registerProvider)(context);
    console.log(`[Magpie Relay v${version}] Extension activated successfully`);
}
function deactivate() {
    // Clear cache on deactivate
    (0, catalog_js_1.clearModelCache)();
    console.log('[Magpie Relay] Extension deactivated');
}
