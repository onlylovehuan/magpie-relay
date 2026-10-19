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
exports.registerProvider = registerProvider;
exports.getProvider = getProvider;
const vscode = __importStar(require("vscode"));
const index_js_1 = require("../provider/index.js");
let provider;
function registerProvider(context) {
    provider = new index_js_1.MagpieRelayProvider(context);
    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand('magpie-relay.setEndpoint', () => provider?.setEndpoint()), vscode.commands.registerCommand('magpie-relay.setGatewayKey', () => provider?.setGatewayKey()), vscode.commands.registerCommand('magpie-relay.setApiKey', () => provider?.setUpstreamKey()), vscode.commands.registerCommand('magpie-relay.refreshModels', () => provider?.refreshModels()), vscode.commands.registerCommand('magpie-relay.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'magpie-relay');
    }), vscode.commands.registerCommand('magpie-relay.clearAll', () => provider?.clearAll()));
    // Register as Copilot Chat language model provider
    // Use 'any' to bypass version-specific type differences
    const regProvider = provider;
    context.subscriptions.push(vscode.lm.registerLanguageModelChatProvider('magpie', regProvider));
    console.log('[Magpie Relay] Provider registered');
    return provider;
}
function getProvider() {
    return provider;
}
