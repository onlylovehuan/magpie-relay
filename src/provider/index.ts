import * as vscode from 'vscode';
import { AuthManager } from '../auth.js';
import { streamChatCompletion } from './stream.js';
import { getEndpoint, getReasoningEffort, isDebugMode } from '../config.js';
import { getModels, clearModelCache } from './catalog.js';

export class MagpieRelayProvider {
  private context: vscode.ExtensionContext;
  private authManager: AuthManager;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.authManager = new AuthManager(context.secrets);
  }

  async provideLanguageModelChatInformation(options: any, token: vscode.CancellationToken): Promise<vscode.LanguageModelChatInformation[]> {
    if (isDebugMode()) {
      console.log('[Magpie Relay] provideLanguageModelChatInformation called, options:', JSON.stringify(options));
    }

    try {
      const models = await getModels(this.authManager);
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
        const capabilities: any = {
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
        } as vscode.LanguageModelChatInformation;
      });

      if (isDebugMode()) {
        console.log('[Magpie Relay] Returning models:', result.length, result.map(m => m.id));
      }

      return result;
    } catch (error) {
      console.error('[Magpie Relay] Failed to fetch models:', error);
      return [];
    }
  }

  private formatDetail(model: any): string {
    const parts: string[] = [];
    if (model.supportsVision) parts.push('Vision');
    if (model.supportsReasoning) parts.push('Reasoning');
    if (model.supportsToolCalling) parts.push('Tools');
    return parts.length > 0 ? parts.join(' · ') : 'Text';
  }

  private formatTooltip(model: any): string {
    const lines = [model.name || model.id];
    if (model.supportsVision) lines.push('✓ Vision (图片输入)');
    if (model.supportsReasoning) lines.push('✓ Reasoning (思考推理)');
    if (model.supportsToolCalling) lines.push('✓ Tools (函数调用)');
    lines.push(`Context: ${model.contextWindow?.toLocaleString()} tokens`);
    return lines.join('\n');
  }

  async provideLanguageModelChatResponse(
    model: vscode.LanguageModelChatInformation,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    const endpoint = getEndpoint();

    if (isDebugMode()) {
      console.log('[Magpie Relay] Chat request - model:', model?.id);
      console.log('[Magpie Relay] Messages count:', messages?.length);
    }

    // Convert messages to OpenAI format
    const convertedMessages = messages.map((msg: vscode.LanguageModelChatRequestMessage) => {
      const role = msg.role === vscode.LanguageModelChatMessageRole.User ? 'user'
        : msg.role === vscode.LanguageModelChatMessageRole.Assistant ? 'assistant'
        : 'user';

      let content: string | any[];

      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = msg.content.map((part: any) => {
          if (part instanceof vscode.LanguageModelTextPart) {
            return { type: 'text', text: part.value };
          }
          if (part instanceof vscode.LanguageModelDataPart) {
            return { type: 'text', text: String(part.data ?? '') };
          }
          return { type: 'text', text: '' };
        });
      } else {
        content = String(msg.content ?? '');
      }

      return { role, content };
    });

    const gatewayKey = await this.authManager.getGatewayKey();
    const upstreamKey = await this.authManager.getUpstreamKey();

    if (isDebugMode()) {
      console.log('[Magpie Relay] Gateway key available:', !!gatewayKey);
    }

    const request: any = {
      model: model.id,
      messages: convertedMessages,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 4096,
    };

    // Add reasoning effort if model supports it
    if (model.capabilities && 'reasoningEfforts' in model.capabilities) {
      request.reasoning_effort = getReasoningEffort();
    }

    if (options?.tools && options.tools.length > 0) {
      request.tools = options.tools.map((tool: any) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema
        }
      }));
      request.tool_choice = 'auto';
      if (isDebugMode()) {
        console.log('[Magpie Relay] Tools:', options.tools.map((t: any) => t.name));
      }
    }

    // Stream via progress (matching commandcode / deepseek-v4 pattern)
    await streamChatCompletion(
      endpoint,
      request,
      gatewayKey,
      upstreamKey,
      {
        progress,
        onError: (error: Error) => {
          if (isDebugMode()) {
            console.error('[Magpie Relay] Stream error:', error);
          }
          throw error;
        },
      },
      token
    );
  }

  async provideTokenCount(
    model: vscode.LanguageModelChatInformation,
    text: string | vscode.LanguageModelChatRequestMessage,
    token: vscode.CancellationToken
  ): Promise<number> {
    if (typeof text === 'string') {
      return Math.ceil(text.length / 4);
    }
    return 256; // Estimate for message objects
  }

  async setEndpoint(): Promise<void> {
    const current = getEndpoint();
    const endpoint = await vscode.window.showInputBox({
      prompt: '输入 Magpie 网关地址',
      value: current,
      placeHolder: 'http://127.0.0.1:3425'
    });

    if (endpoint) {
      const config = vscode.workspace.getConfiguration('magpie-relay');
      await config.update('endpoint', endpoint, vscode.ConfigurationTarget.Global);
      clearModelCache();
      vscode.window.showInformationMessage('网关地址已更新，请刷新模型列表');
    }
  }

  async setGatewayKey(): Promise<void> {
    const key = await vscode.window.showInputBox({
      prompt: '输入 Magpie 网关密钥',
      password: true,
      placeHolder: '输入网关密钥'
    });

    if (key) {
      await this.authManager.setGatewayKey(key);
      clearModelCache();
      vscode.window.showInformationMessage('网关密钥已保存');
    }
  }

  async setUpstreamKey(): Promise<void> {
    const key = await vscode.window.showInputBox({
      prompt: '输入上游 API 密钥（可选，部分模型需要）',
      password: true,
      placeHolder: '输入上游 API 密钥'
    });

    if (key !== undefined) {
      await this.authManager.setUpstreamKey(key);
      clearModelCache();
      vscode.window.showInformationMessage('上游密钥已保存');
    }
  }

  async refreshModels(): Promise<void> {
    try {
      clearModelCache();
      const models = await getModels(this.authManager, true);
      vscode.window.showInformationMessage(`已刷新，找到 ${models.length} 个模型`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      vscode.window.showErrorMessage(`刷新失败: ${message}`);
    }
  }

  async clearAll(): Promise<void> {
    const confirmed = await vscode.window.showQuickPick(['是', '否'], {
      placeHolder: '确定要清除所有配置吗？'
    });

    if (confirmed === '是') {
      await this.authManager.clearAll();
      clearModelCache();
      vscode.window.showInformationMessage('已清除所有配置');
    }
  }
}
