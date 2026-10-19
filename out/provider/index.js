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
const config_js_1 = require("../config.js");
const catalog_js_1 = require("./catalog.js");
// Use any to bypass complex VS Code API type mismatches between versions
class MagpieRelayProvider {
    context;
    authManager;
    constructor(context) {
        this.context = context;
        this.authManager = new auth_js_1.AuthManager(context.secrets);
    }
    async provideLanguageModelChatInformation(options, token) {
        try {
            const models = await (0, catalog_js_1.getModels)(this.authManager);
            if (token.isCancellationRequested) {
                return [];
            }
            return models.map(model => ({
                id: model.id,
                name: model.name,
                contextWindow: model.contextWindow,
                maxOutputTokens: model.maxOutputTokens || 4096,
            }));
        }
        catch (error) {
            console.error('[Magpie Relay] Failed to fetch models:', error);
            return [];
        }
    }
    async provideLanguageModelChatResponse(model, messages, options, progress, token) {
        const endpoint = (0, config_js_1.getEndpoint)();
        try {
            // Convert messages
            const convertedMessages = messages.map((msg) => {
                const role = msg.role === 1 ? 'user' : msg.role === 2 ? 'assistant' : 'user';
                const content = typeof msg.content === 'string' ? msg.content
                    : msg.content.map((part) => {
                        if (part.value !== undefined) {
                            return { type: 'text', text: part.value };
                        }
                        return { type: 'text', text: String(part.data ?? '') };
                    });
                return { role, content };
            });
            const gatewayKey = await this.authManager.getGatewayKey();
            const upstreamKey = await this.authManager.getUpstreamKey();
            const request = {
                model: model.id,
                messages: convertedMessages,
                stream: true,
                max_tokens: 4096,
                reasoning_effort: (0, config_js_1.getReasoningEffort)()
            };
            if (options.tools && options.tools.length > 0) {
                request.tools = options.tools.map((tool) => ({
                    type: 'function',
                    function: {
                        name: tool.name,
                        description: tool.description,
                        parameters: tool.inputSchema
                    }
                }));
                request.tool_choice = 'auto';
            }
            const controller = new AbortController();
            token.onCancellationRequested(() => controller.abort());
            const headers = {
                'Content-Type': 'application/json'
            };
            if (gatewayKey)
                headers['Authorization'] = `Bearer ${gatewayKey}`;
            if (upstreamKey)
                headers['x-api-key'] = upstreamKey;
            const response = await fetch(`${endpoint}/v1/chat/completions`, {
                method: 'POST',
                headers,
                body: JSON.stringify(request),
                signal: controller.signal
            });
            if (!response.ok) {
                throw new Error(`API 请求失败 (${response.status})`);
            }
            const body = response.body;
            if (!body)
                throw new Error('No response body');
            const reader = body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.startsWith('data: '))
                        continue;
                    const data = line.slice(6);
                    if (data === '[DONE]')
                        return;
                    try {
                        const chunk = JSON.parse(data);
                        const delta = chunk.choices?.[0]?.delta;
                        if (delta?.content) {
                            progress.report(delta.content);
                        }
                    }
                    catch {
                        // Ignore parse errors
                    }
                }
            }
        }
        catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                return;
            }
            throw error;
        }
    }
    async provideTokenCount(model, text, token) {
        return Math.ceil(text.length / 4);
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
