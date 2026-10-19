import * as vscode from 'vscode';
import { AuthManager } from '../auth.js';
import { createUserFacingError } from '../errors.js';
import { logger } from '../logger.js';
import {
  clearModelCache,
  getModelById,
  getModels,
} from './catalog.js';
import { prepareChatRequest } from './request.js';
import { streamChatCompletion } from './stream.js';
import { estimateTokenCount } from './tokens.js';
import type { ModelInfo, ThinkingCapability } from '../types.js';

type ConfigurationOptions = vscode.ProvideLanguageModelChatResponseOptions & {
  readonly modelConfiguration?: Record<string, unknown>;
};

export class MagpieRelayProvider {
  private readonly context: vscode.ExtensionContext;
  private readonly authManager: AuthManager;
  private readonly onDidChangeModelsEmitter = new vscode.EventEmitter<void>();
  private modelById = new Map<string, ModelInfo>();
  private charsPerToken = 4;

  readonly onDidChangeLanguageModelChatInformation =
    this.onDidChangeModelsEmitter.event;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.authManager = new AuthManager(context.secrets);

    context.subscriptions.push(
      this.onDidChangeModelsEmitter,
      vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('magpie-relay')) {
          clearModelCache();
          this.refreshModelPicker();
        }
      }),
      context.secrets.onDidChange(() => {
        clearModelCache();
        this.refreshModelPicker();
      }),
    );
  }

  refreshModelPicker(): void {
    this.onDidChangeModelsEmitter.fire();
  }

  async provideLanguageModelChatInformation(
    _options: unknown,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelChatInformation[]> {
    if (token.isCancellationRequested) return [];

    const hasApiKey = await this.authManager.hasAnyKey();
    if (!hasApiKey) {
      return [this.unavailableModel('请先设置 Magpie 网关密钥。')];
    }

    try {
      const models = await getModels(this.authManager, false, token);
      if (token.isCancellationRequested) return [];
      this.modelById = new Map(models.map(model => [model.id, model]));
      return models.map(model => this.toChatInfo(model, true));
    } catch (error) {
      const displayError = createUserFacingError(toError(error));
      logger.error('Failed to load Magpie models', error);
      return [this.unavailableModel(displayError.message)];
    }
  }

  async provideLanguageModelChatResponse(
    model: vscode.LanguageModelChatInformation,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const modelDefinition = await getModelById(model.id, this.authManager);
    if (token.isCancellationRequested) return;
    if (model.id.startsWith('magpie/unavailable')) {
      throw new Error(model.detail || 'Magpie 当前不可用。');
    }

    const prepared = await prepareChatRequest({
      authManager: this.authManager,
      modelInfo: model,
      modelDefinition,
      messages,
      requestOptions: options as ConfigurationOptions,
      token,
    });

    logger.debug(
      `Prepared Magpie request model=${model.id} messages=${prepared.request.messages.length} `
      + `tools=${prepared.request.tools?.length ?? 0} thinking=${prepared.thinkingEffort ?? 'off'}`,
    );

    await streamChatCompletion({
      prepared,
      progress,
      token,
      getCharsPerToken: () => this.charsPerToken,
      setCharsPerToken: value => {
        this.charsPerToken = value;
      },
    });
  }

  async provideTokenCount(
    _model: vscode.LanguageModelChatInformation,
    text: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken,
  ): Promise<number> {
    return estimateTokenCount(text, this.charsPerToken);
  }

  async setEndpoint(): Promise<void> {
    const current = vscode.workspace.getConfiguration('magpie-relay').get<string>('endpoint');
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
        } catch {
          return '请输入有效的 URL。';
        }
      },
    });
    if (!endpoint) return;

    await vscode.workspace.getConfiguration('magpie-relay').update(
      'endpoint',
      endpoint.replace(/\/+$/, ''),
      vscode.ConfigurationTarget.Global,
    );
    clearModelCache();
    this.refreshModelPicker();
    vscode.window.showInformationMessage('Magpie 网关地址已更新。');
  }

  async setGatewayKey(): Promise<void> {
    const key = await promptSecret('输入 Magpie 网关密钥');
    if (key === undefined) return;
    await this.authManager.setGatewayKey(key);
    clearModelCache();
    this.refreshModelPicker();
  }

  async setUpstreamKey(): Promise<void> {
    const key = await promptSecret('输入上游 API 密钥（可留空清除）');
    if (key === undefined) return;
    await this.authManager.setUpstreamKey(key);
    clearModelCache();
    this.refreshModelPicker();
  }

  async refreshModels(): Promise<void> {
    try {
      clearModelCache();
      const models = await getModels(this.authManager, true);
      this.modelById = new Map(models.map(model => [model.id, model]));
      this.refreshModelPicker();
      vscode.window.showInformationMessage(`已刷新，找到 ${models.length} 个模型。`);
    } catch (error) {
      const displayError = createUserFacingError(toError(error));
      logger.error('Failed to refresh Magpie models', error);
      vscode.window.showErrorMessage(`刷新失败: ${displayError.message}`);
      this.refreshModelPicker();
    }
  }

  async clearAll(): Promise<void> {
    const confirmed = await vscode.window.showQuickPick(['是', '否'], {
      placeHolder: '确定要清除所有 Magpie 配置吗？',
    });
    if (confirmed !== '是') return;
    await this.authManager.clearAll();
    clearModelCache();
    this.refreshModelPicker();
    vscode.window.showInformationMessage('已清除所有 Magpie 配置。');
  }

  private toChatInfo(
    model: ModelInfo,
    hasApiKey: boolean,
  ): vscode.LanguageModelChatInformation {
    const separator = model.id.indexOf('/');
    const provider = separator > 0 ? model.id.slice(0, separator) : 'magpie';
    const modelName = separator > 0 ? model.id.slice(separator + 1) : model.name || model.id;
    const capabilities: Record<string, unknown> = {
      toolCalling: model.supportsToolCalling,
      imageInput: model.supportsVision,
    };
    if (model.thinking) capabilities.reasoningEfforts = model.thinking.supportedEfforts;

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
    } as vscode.LanguageModelChatInformation;
  }

  private unavailableModel(detail: string): vscode.LanguageModelChatInformation {
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
    } as vscode.LanguageModelChatInformation;
  }
}

function buildThinkingEffortSchema(thinking: ThinkingCapability) {
  const efforts: string[] = [
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

function formatDetail(model: ModelInfo): string {
  const parts: string[] = [];
  if (model.supportsVision) parts.push('Vision');
  if (model.supportsReasoning) parts.push('Reasoning');
  if (model.supportsToolCalling) parts.push('Tools');
  return parts.length > 0 ? parts.join(' · ') : 'Text';
}

function formatTooltip(model: ModelInfo): string {
  return [
    model.name || model.id,
    `Model ID: ${model.id}`,
    `Context: ${model.contextWindow.toLocaleString()} tokens`,
    `Input budget: ${model.maxInputTokens.toLocaleString()} tokens`,
    `Output limit: ${(model.maxOutputTokens || 0).toLocaleString()} tokens`,
    `Capabilities: ${formatDetail(model)}`,
  ].join('\n');
}

function formatEffortLabel(effort: string): string {
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

function formatEffortDescription(effort: string): string {
  if (effort === 'none') return 'Disable thinking for models that support it.';
  return `Use model-supported reasoning effort: ${effort}.`;
}

async function promptSecret(prompt: string): Promise<string | undefined> {
  return vscode.window.showInputBox({
    prompt,
    password: true,
  });
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
