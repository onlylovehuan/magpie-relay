"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const provider_js_1 = require("./provider.js");
const catalog_js_1 = require("../provider/catalog.js");
async function activate(context) {
    const version = context.extension.packageJSON.version;
    console.log(`[Magpie Relay v${version}] Extension activating...`);
    // Register the language model provider
    const provider = (0, provider_js_1.registerProvider)(context);
    // Some Copilot builds cache picker metadata before BYOK providers expose
    // configurationSchema. Activate first, then ask it to re-query our provider.
    await activateCopilotChat();
    provider.refreshModelPicker();
    console.log(`[Magpie Relay v${version}] Extension activated successfully`);
}
function deactivate() {
    // Clear cache on deactivate
    (0, catalog_js_1.clearModelCache)();
    console.log('[Magpie Relay] Extension deactivated');
}
async function activateCopilotChat() {
    try {
        await vscode.extensions.getExtension('github.copilot-chat')?.activate();
    }
    catch (error) {
        console.warn('[Magpie Relay] Copilot Chat activation unavailable; model picker refresh may be delayed', error);
    }
}
