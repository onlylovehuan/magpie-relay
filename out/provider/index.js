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
exports.MagpieRelayProvider = void 0;
const vscode = __importStar(require("vscode"));
const auth_js_1 = require("../auth.js");
const stream_js_1 = require("./stream.js");
const config_js_1 = require("../config.js");
const catalog_js_1 = require("./catalog.js");
class MagpieRelayProvider {
    context;
    authManager;
    constructor(context) {
        this.context = context;
        this.authManager = new auth_js_1.AuthManager(context.secrets);
    }
    async provideLanguageModelChatInformation(options, token) {
        if ((0, config_js_1.isDebugMode)()) {
            console.log('[Magpie Relay] provideLanguageModelChatInformation called, options:', JSON.stringify(options));
        }
        try {
            const models = await (0, catalog_js_1.getModels)(this.authManager);
            if (token.isCancellationRequested) {
                return [];
            }
            const hasApiKey = await this.authManager.hasAnyKey();
            const result = models.map(model => {
                // Parse provider from model ID (format: "provider/model-id")
                const parts = model.id.split('/');
                const provider = parts[0] || 'unknown';
                const modelName = parts.slice(1).join('/') || model.name || model.id;
                const displayName = `${provider} / ${modelName}`;
                // Build capabilities
                const capabilities = {
                    toolCalling: model.supportsToolCalling,
                    imageInput: model.supportsVision,
                    streaming: true,
                };
                // Add reasoning if supported
                if (model.supportsReasoning) {
                    capabilities.reasoningEfforts = model.reasoningEfforts || ['low', 'medium', 'high'];
                }
                return {
                    id: model.id,
                    name: displayName,
                    family: provider,
                    version: '1.0',
                    maxInputTokens: model.contextWindow,
                    maxOutputTokens: model.maxOutputTokens || 4096,
                    isBYOK: true,
                    isUserSelectable: true,
                    capabilities,
                    statusIcon: hasApiKey ? undefined : new vscode.ThemeIcon('warning'),
                    detail: this.formatDetail(model),
                    tooltip: this.formatTooltip(model),
                };
            });
            if ((0, config_js_1.isDebugMode)()) {
                console.log('[Magpie Relay] Returning models:', result.length, result.map(m => m.id));
            }
            return result;
        }
        catch (error) {
            console.error('[Magpie Relay] Failed to fetch models:', error);
            return [];
        }
    }
    formatDetail(model) {
        const parts = [];
        if (model.supportsVision)
            parts.push('Vision');
        if (model.supportsReasoning)
            parts.push('Reasoning');
        if (model.supportsToolCalling)
            parts.push('Tools');
        return parts.length > 0 ? parts.join(' · ') : 'Text';
    }
    formatTooltip(model) {
        const lines = [model.name || model.id];
        if (model.supportsVision)
            lines.push('✓ Vision (图片输入)');
        if (model.supportsReasoning)
            lines.push('✓ Reasoning (思考推理)');
        if (model.supportsToolCalling)
            lines.push('✓ Tools (函数调用)');
        lines.push(`Context: ${model.contextWindow?.toLocaleString()} tokens`);
        return lines.join('\n');
    }
    async provideLanguageModelChatResponse(model, messages, options, progress, token) {
        const endpoint = (0, config_js_1.getEndpoint)();
        if ((0, config_js_1.isDebugMode)()) {
            console.log('[Magpie Relay] Chat request - model:', model?.id);
            console.log('[Magpie Relay] Messages count:', messages?.length);
        }
        // Convert messages to OpenAI format
        const convertedMessages = messages.map((msg) => {
            const role = msg.role === vscode.LanguageModelChatMessageRole.User ? 'user'
                : msg.role === vscode.LanguageModelChatMessageRole.Assistant ? 'assistant'
                    : 'user';
            let content;
            if (typeof msg.content === 'string') {
                content = msg.content;
            }
            else if (Array.isArray(msg.content)) {
                content = msg.content.map((part) => {
                    if (part instanceof vscode.LanguageModelTextPart) {
                        return { type: 'text', text: part.value };
                    }
                    if (part instanceof vscode.LanguageModelDataPart) {
                        return { type: 'text', text: String(part.data ?? '') };
                    }
                    return { type: 'text', text: '' };
                });
            }
            else {
                content = String(msg.content ?? '');
            }
            return { role, content };
        });
        const gatewayKey = await this.authManager.getGatewayKey();
        const upstreamKey = await this.authManager.getUpstreamKey();
        if ((0, config_js_1.isDebugMode)()) {
            console.log('[Magpie Relay] Gateway key available:', !!gatewayKey);
        }
        const request = {
            model: model.id,
            messages: convertedMessages,
            stream: true,
            stream_options: { include_usage: true },
            max_tokens: 4096,
        };
        // Add reasoning effort if model supports it
        if (model.capabilities && 'reasoningEfforts' in model.capabilities) {
            request.reasoning_effort = (0, config_js_1.getReasoningEffort)();
        }
        if (options?.tools && options.tools.length > 0) {
            request.tools = options.tools.map((tool) => ({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.inputSchema
                }
            }));
            request.tool_choice = 'auto';
            if ((0, config_js_1.isDebugMode)()) {
                console.log('[Magpie Relay] Tools:', options.tools.map((t) => t.name));
            }
        }
        // Stream via progress (matching commandcode / deepseek-v4 pattern)
        await (0, stream_js_1.streamChatCompletion)(endpoint, request, gatewayKey, upstreamKey, {
            progress,
            onError: (error) => {
                if ((0, config_js_1.isDebugMode)()) {
                    console.error('[Magpie Relay] Stream error:', error);
                }
                throw error;
            },
        }, token);
    }
    async provideTokenCount(model, text, token) {
        if (typeof text === 'string') {
            return Math.ceil(text.length / 4);
        }
        return 256; // Estimate for message objects
    }
    async setEndpoint() {
        const current = (0, config_js_1.getEndpoint)();
        const endpoint = await vscode.window.showInputBox({
            prompt: '输入 Magpie 网关地址',
            value: current,
            placeHolder: 'http://127.0.0.1:3425'
        });
        if (endpoint) {
            const config = vscode.workspace.getConfiguration('magpie-relay');
            await config.update('endpoint', endpoint, vscode.ConfigurationTarget.Global);
            (0, catalog_js_1.clearModelCache)();
            vscode.window.showInformationMessage('网关地址已更新，请刷新模型列表');
        }
    }
    async setGatewayKey() {
        const key = await vscode.window.showInputBox({
            prompt: '输入 Magpie 网关密钥',
            password: true,
            placeHolder: '输入网关密钥'
        });
        if (key) {
            await this.authManager.setGatewayKey(key);
            (0, catalog_js_1.clearModelCache)();
            vscode.window.showInformationMessage('网关密钥已保存');
        }
    }
    async setUpstreamKey() {
        const key = await vscode.window.showInputBox({
            prompt: '输入上游 API 密钥（可选，部分模型需要）',
            password: true,
            placeHolder: '输入上游 API 密钥'
        });
        if (key !== undefined) {
            await this.authManager.setUpstreamKey(key);
            (0, catalog_js_1.clearModelCache)();
            vscode.window.showInformationMessage('上游密钥已保存');
        }
    }
    async refreshModels() {
        try {
            (0, catalog_js_1.clearModelCache)();
            const models = await (0, catalog_js_1.getModels)(this.authManager, true);
            vscode.window.showInformationMessage(`已刷新，找到 ${models.length} 个模型`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : '未知错误';
            vscode.window.showErrorMessage(`刷新失败: ${message}`);
        }
    }
    async clearAll() {
        const confirmed = await vscode.window.showQuickPick(['是', '否'], {
            placeHolder: '确定要清除所有配置吗？'
        });
        if (confirmed === '是') {
            await this.authManager.clearAll();
            (0, catalog_js_1.clearModelCache)();
            vscode.window.showInformationMessage('已清除所有配置');
        }
    }
}
exports.MagpieRelayProvider = MagpieRelayProvider;
