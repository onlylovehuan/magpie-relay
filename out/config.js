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
exports.CONFIG_SECTION = void 0;
exports.getEndpoint = getEndpoint;
exports.getMaxTokens = getMaxTokens;
exports.getReasoningEffort = getReasoningEffort;
exports.getModelConfiguredReasoningEffort = getModelConfiguredReasoningEffort;
exports.isDebugMode = isDebugMode;
exports.getEnableTools = getEnableTools;
exports.updateConfig = updateConfig;
const vscode = __importStar(require("vscode"));
exports.CONFIG_SECTION = 'magpie-relay';
function getEndpoint() {
    const config = vscode.workspace.getConfiguration(exports.CONFIG_SECTION);
    let endpoint = config.get('endpoint') || 'http://127.0.0.1:3425';
    // Remove trailing slashes
    endpoint = endpoint.replace(/\/+$/, '');
    return endpoint;
}
function getMaxTokens() {
    const config = vscode.workspace.getConfiguration(exports.CONFIG_SECTION);
    const value = config.get('maxTokens', 0);
    return value > 0 ? value : undefined;
}
function getReasoningEffort() {
    const config = vscode.workspace.getConfiguration(exports.CONFIG_SECTION);
    return config.get('reasoningEffort') || 'medium';
}
/**
 * Read the per-model `reasoningEffort` from VS Code's model configuration.
 * `modelConfiguration` is set by the user per-model in the picker dropdown.
 */
function getModelConfiguredReasoningEffort(options) {
    const modelCfg = options?.modelConfiguration;
    if (typeof modelCfg?.reasoningEffort === 'string') {
        return modelCfg.reasoningEffort;
    }
    return undefined;
}
function isDebugMode() {
    const config = vscode.workspace.getConfiguration(exports.CONFIG_SECTION);
    return config.get('debugMode') || false;
}
function getEnableTools() {
    const config = vscode.workspace.getConfiguration(exports.CONFIG_SECTION);
    return config.get('enableTools') ?? true;
}
async function updateConfig(key, value) {
    const config = vscode.workspace.getConfiguration(exports.CONFIG_SECTION);
    await config.update(key, value, vscode.ConfigurationTarget.Global);
}
