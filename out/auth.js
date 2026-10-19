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
exports.AuthManager = void 0;
exports.getEndpoint = getEndpoint;
exports.getMaxTokens = getMaxTokens;
exports.getReasoningEffort = getReasoningEffort;
exports.isDebugMode = isDebugMode;
exports.updateConfig = updateConfig;
const vscode = __importStar(require("vscode"));
const consts_js_1 = require("./consts.js");
function getEndpoint() {
    const config = vscode.workspace.getConfiguration(consts_js_1.CONFIG_SECTION);
    return config.get('endpoint') || 'http://127.0.0.1:3425';
}
function getMaxTokens() {
    const config = vscode.workspace.getConfiguration(consts_js_1.CONFIG_SECTION);
    return config.get('maxTokens') || 4096;
}
function getReasoningEffort() {
    const config = vscode.workspace.getConfiguration(consts_js_1.CONFIG_SECTION);
    return config.get('reasoningEffort') || 'medium';
}
function isDebugMode() {
    const config = vscode.workspace.getConfiguration(consts_js_1.CONFIG_SECTION);
    return config.get('debugMode') || false;
}
async function updateConfig(key, value) {
    const config = vscode.workspace.getConfiguration(consts_js_1.CONFIG_SECTION);
    await config.update(key, value, vscode.ConfigurationTarget.Global);
}
class AuthManager {
    secretStorage;
    constructor(secretStorage) {
        this.secretStorage = secretStorage;
    }
    async getGatewayKey() {
        // Try secret storage first
        const secret = await this.secretStorage.get(consts_js_1.SECRET_GATEWAY_KEY);
        if (secret)
            return secret;
        // Fallback to config
        const config = vscode.workspace.getConfiguration(consts_js_1.CONFIG_SECTION);
        return config.get('gatewayKey');
    }
    async setGatewayKey(key) {
        const trimmed = key.trim();
        if (trimmed) {
            await this.secretStorage.store(consts_js_1.SECRET_GATEWAY_KEY, trimmed);
        }
        else {
            await this.secretStorage.delete(consts_js_1.SECRET_GATEWAY_KEY);
        }
        await updateConfig('gatewayKey', undefined);
    }
    async getUpstreamKey() {
        const secret = await this.secretStorage.get(consts_js_1.SECRET_UPSTREAM_KEY);
        if (secret)
            return secret;
        const config = vscode.workspace.getConfiguration(consts_js_1.CONFIG_SECTION);
        return config.get('upstreamApiKey');
    }
    async setUpstreamKey(key) {
        const trimmed = key.trim();
        if (trimmed) {
            await this.secretStorage.store(consts_js_1.SECRET_UPSTREAM_KEY, trimmed);
        }
        else {
            await this.secretStorage.delete(consts_js_1.SECRET_UPSTREAM_KEY);
        }
        await updateConfig('upstreamApiKey', undefined);
    }
    async hasAnyKey() {
        const gateway = await this.getGatewayKey();
        const upstream = await this.getUpstreamKey();
        return !!(gateway || upstream);
    }
    async clearAll() {
        await this.secretStorage.delete(consts_js_1.SECRET_GATEWAY_KEY);
        await this.secretStorage.delete(consts_js_1.SECRET_UPSTREAM_KEY);
    }
}
exports.AuthManager = AuthManager;
