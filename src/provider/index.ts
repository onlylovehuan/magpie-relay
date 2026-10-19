import * as vscode from 'vscode';
import { AuthManager } from '../auth.js';
import { getEndpoint, getReasoningEffort } from '../config.js';
import { getModels, clearModelCache } from './catalog.js';

// Use any to bypass complex VS Code API type mismatches between versions
export class MagpieRelayProvider {
  private context: vscode.ExtensionContext;
  private authManager: AuthManager;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.authManager = new AuthManager(context.secrets);
  }

  async provideLanguageModelChatInformation(options: any, token: vscode.CancellationToken): Promise<any[]> {
    try {
      const models = await getModels(this.authManager);
      if (token.isCancellationRequested) {
        return [];
      }

      return models.map(model => ({
        id: model.id,
        name: model.name,
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxOutputTokens || 4096,
      }));
    } catch (error) {
      console.error('[Magpie Relay] Failed to fetch models:', error);
      return [];
    }
  }

  async provideLanguageModelChatResponse(
    model: any,
    messages: readonly any[],
    options: any,
    progress: any,
    token: vscode.CancellationToken
  ): Promise<void> {
    const endpoint = getEndpoint();

    try {
      // Safe access to options
      const tools = options?.tools;

      // Convert messages
      const convertedMessages = messages.map((msg: any) => {
        const role = msg.role === 1 ? 'user' : msg.role === 2 ? 'assistant' : 'user';
        const content = typeof msg.content === 'string' ? msg.content
          : (msg.content || []).map((part: any) => {
            if (part?.value !== undefined) {
              return { type: 'text', text: part.value };
            }
            return { type: 'text', text: String(part?.data ?? '') };
          });
        return { role, content };
      });

      const gatewayKey = await this.authManager.getGatewayKey();
      const upstreamKey = await this.authManager.getUpstreamKey();

      const request: any = {
        model: model.id,
        messages: convertedMessages,
        stream: true,
        max_tokens: 4096,
        reasoning_effort: getReasoningEffort()
      };

      // Safe check for tools
      if (tools && Array.isArray(tools) && tools.length > 0) {
        request.tools = tools.map((tool: any) => ({
          type: 'function',
          function: {
            name: tool?.name || '',
            description: tool?.description || '',
            parameters: tool?.inputSchema || { type: 'object' }
          }
        }));
        request.tool_choice = 'auto';
      }

      const controller = new AbortController();
      token.onCancellationRequested(() => controller.abort());

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (gatewayKey) headers['Authorization'] = `Bearer ${gatewayKey}`;
      if (upstreamKey) headers['x-api-key'] = upstreamKey;

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
      if (!body) throw new Error('No response body');

      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta;
            if (delta?.content) {
              progress.report(delta.content);
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      throw error;
    }
  }

  async provideTokenCount(model: any, text: string, token: vscode.CancellationToken): Promise<number> {
    return Math.ceil(text.length / 4);
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
