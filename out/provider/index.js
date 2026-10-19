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
const errors_js_1 = require("../errors.js");
const logger_js_1 = require("../logger.js");
const catalog_js_1 = require("./catalog.js");
const request_js_1 = require("./request.js");
const stream_js_1 = require("./stream.js");
const tokens_js_1 = require("./tokens.js");
class MagpieRelayProvider {
    context;
    authManager;
    onDidChangeModelsEmitter = new vscode.EventEmitter();
    modelById = new Map();
    charsPerToken = 4;
    onDidChangeLanguageModelChatInformation = this.onDidChangeModelsEmitter.event;
    constructor(context) {
        this.context = context;
        this.authManager = new auth_js_1.AuthManager(context.secrets);
        context.subscriptions.push(this.onDidChangeModelsEmitter, vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('magpie-relay')) {
                (0, catalog_js_1.clearModelCache)();
                this.refreshModelPicker();
            }
        }), context.secrets.onDidChange(() => {
            (0, catalog_js_1.clearModelCache)();
            this.refreshModelPicker();
        }));
    }
    refreshModelPicker() {
        this.onDidChangeModelsEmitter.fire();
    }
    async provideLanguageModelChatInformation(_options, token) {
        if (token.isCancellationRequested)
            return [];
        const hasApiKey = await this.authManager.hasAnyKey();
        if (!hasApiKey) {
            return [this.unavailableModel('请先设置 Magpie 网关密钥。')];
        }
        try {
            const models = await (0, catalog_js_1.getModels)(this.authManager, false, token);
            if (token.isCancellationRequested)
                return [];
            this.modelById = new Map(models.map(model => [model.id, model]));
            return models.map(model => this.toChatInfo(model, true));
        }
        catch (error) {
            const displayError = (0, errors_js_1.createUserFacingError)(toError(error));
            logger_js_1.logger.error('Failed to load Magpie models', error);
            return [this.unavailableModel(displayError.message)];
        }
    }
    async provideLanguageModelChatResponse(model, messages, options, progress, token) {
        const modelDefinition = await (0, catalog_js_1.getModelById)(model.id, this.authManager);
        if (token.isCancellationRequested)
            return;
        if (model.id.startsWith('magpie/unavailable')) {
            throw new Error(model.detail || 'Magpie 当前不可用。');
        }
        const prepared = await (0, request_js_1.prepareChatRequest)({
            authManager: this.authManager,
            modelInfo: model,
            modelDefinition,
            messages,
            requestOptions: options,
            token,
        });
        logger_js_1.logger.debug(`Prepared Magpie request model=${model.id} messages=${prepared.request.messages.length} `
            + `tools=${prepared.request.tools?.length ?? 0} thinking=${prepared.thinkingEffort ?? 'off'}`);
        await (0, stream_js_1.streamChatCompletion)({
            prepared,
            progress,
            token,
            getCharsPerToken: () => this.charsPerToken,
            setCharsPerToken: value => {
                this.charsPerToken = value;
            },
        });
    }
    async provideTokenCount(_model, text, _token) {
        return (0, tokens_js_1.estimateTokenCount)(text, this.charsPerToken);
    }
    async setEndpoint() {
        const current = vscode.workspace.getConfiguration('magpie-relay').get('endpoint');
        const endpoint = await vscode.window.showInputBox({
            prompt: '输入 Magpie 网关地址',
            value: current || 'http://127.0.0.1:3425',
            placeHolder: 'http://127.0.0.1:3425',
            validateInput: value => {
                try {
                    const parsed = new URL(value);
                    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
                        ? undefined
                        : '地址必须使用 http 或 https。';
                }
                catch {
                    return '请输入有效的 URL。';
                }
            },
        });
        if (!endpoint)
            return;
        await vscode.workspace.getConfiguration('magpie-relay').update('endpoint', endpoint.replace(/\/+$/, ''), vscode.ConfigurationTarget.Global);
        (0, catalog_js_1.clearModelCache)();
        this.refreshModelPicker();
        vscode.window.showInformationMessage('Magpie 网关地址已更新。');
    }
    async setGatewayKey() {
        const key = await promptSecret('输入 Magpie 网关密钥');
        if (key === undefined)
            return;
        await this.authManager.setGatewayKey(key);
        (0, catalog_js_1.clearModelCache)();
        this.refreshModelPicker();
    }
    async setUpstreamKey() {
        const key = await promptSecret('输入上游 API 密钥（可留空清除）');
        if (key === undefined)
            return;
        await this.authManager.setUpstreamKey(key);
        (0, catalog_js_1.clearModelCache)();
        this.refreshModelPicker();
    }
    async refreshModels() {
        try {
            (0, catalog_js_1.clearModelCache)();
            const models = await (0, catalog_js_1.getModels)(this.authManager, true);
            this.modelById = new Map(models.map(model => [model.id, model]));
            this.refreshModelPicker();
            vscode.window.showInformationMessage(`已刷新，找到 ${models.length} 个模型。`);
        }
        catch (error) {
            const displayError = (0, errors_js_1.createUserFacingError)(toError(error));
            logger_js_1.logger.error('Failed to refresh Magpie models', error);
            vscode.window.showErrorMessage(`刷新失败: ${displayError.message}`);
            this.refreshModelPicker();
        }
    }
    async clearAll() {
        const confirmed = await vscode.window.showQuickPick(['是', '否'], {
            placeHolder: '确定要清除所有 Magpie 配置吗？',
        });
        if (confirmed !== '是')
            return;
        await this.authManager.clearAll();
        (0, catalog_js_1.clearModelCache)();
        this.refreshModelPicker();
        vscode.window.showInformationMessage('已清除所有 Magpie 配置。');
    }
    toChatInfo(model, hasApiKey) {
        const separator = model.id.indexOf('/');
        const provider = separator > 0 ? model.id.slice(0, separator) : 'magpie';
        const modelName = separator > 0 ? model.id.slice(separator + 1) : model.name || model.id;
        const capabilities = {
            toolCalling: model.supportsToolCalling,
            imageInput: model.supportsVision,
        };
        if (model.thinking)
            capabilities.reasoningEfforts = model.thinking.supportedEfforts;
        return {
            id: model.id,
            name: `${provider} / ${modelName}`,
            family: provider,
            version: model.maxOutputTokens?.toString() || 'dynamic',
            detail: hasApiKey ? formatDetail(model) : '请先设置网关密钥',
            tooltip: formatTooltip(model),
            statusIcon: hasApiKey ? undefined : new vscode.ThemeIcon('warning'),
            maxInputTokens: model.maxInputTokens,
            maxOutputTokens: model.maxOutputTokens || 4096,
            isBYOK: true,
            isUserSelectable: true,
            capabilities,
            ...(model.thinking
                ? { configurationSchema: buildThinkingEffortSchema(model.thinking) }
                : {}),
        };
    }
    unavailableModel(detail) {
        return {
            id: 'magpie/unavailable',
            name: 'Magpie Relay',
            family: 'magpie',
            version: 'unavailable',
            detail,
            tooltip: detail,
            statusIcon: new vscode.ThemeIcon('warning'),
            maxInputTokens: 1,
            maxOutputTokens: 1,
            isBYOK: true,
            isUserSelectable: false,
            capabilities: {
                toolCalling: false,
                imageInput: false,
            },
        };
    }
}
exports.MagpieRelayProvider = MagpieRelayProvider;
function buildThinkingEffortSchema(thinking) {
    const efforts = [
        ...(thinking.canDisable ? ['none'] : []),
        ...thinking.supportedEfforts,
    ];
    return {
        properties: {
            reasoningEffort: {
                type: 'string',
                title: 'Thinking',
                enum: efforts,
                enumItemLabels: efforts.map(effort => formatEffortLabel(effort)),
                enumDescriptions: efforts.map(effort => formatEffortDescription(effort)),
                default: thinking.defaultEffort,
                group: 'navigation',
            },
        },
    };
}
function formatDetail(model) {
    const parts = [];
    if (model.supportsVision)
        parts.push('Vision');
    if (model.supportsReasoning)
        parts.push('Reasoning');
    if (model.supportsToolCalling)
        parts.push('Tools');
    return parts.length > 0 ? parts.join(' · ') : 'Text';
}
function formatTooltip(model) {
    return [
        model.name || model.id,
        `Model ID: ${model.id}`,
        `Context: ${model.contextWindow.toLocaleString()} tokens`,
        `Input budget: ${model.maxInputTokens.toLocaleString()} tokens`,
        `Output limit: ${(model.maxOutputTokens || 0).toLocaleString()} tokens`,
        `Capabilities: ${formatDetail(model)}`,
    ].join('\n');
}
function formatEffortLabel(effort) {
    switch (effort) {
        case 'none': return 'Off';
        case 'minimal': return 'Minimal';
        case 'low': return 'Low';
        case 'medium': return 'Medium';
        case 'high': return 'High';
        case 'xhigh': return 'XHigh';
        case 'max': return 'Max';
        default: return effort;
    }
}
function formatEffortDescription(effort) {
    if (effort === 'none')
        return 'Disable thinking for models that support it.';
    return `Use model-supported reasoning effort: ${effort}.`;
}
async function promptSecret(prompt) {
    return vscode.window.showInputBox({
        prompt,
        password: true,
    });
}
function toError(error) {
    return error instanceof Error ? error : new Error(String(error));
}
