import * as vscode from 'vscode';
import { ChatCompletionRequest, StreamResponse, ToolCall } from '../types.js';
import { getEndpoint, getMaxTokens, getReasoningEffort, isDebugMode } from '../config.js';
import { AuthManager } from '../auth.js';
import { convertMessages, convertTools } from './convert.js';

interface StreamCallbacks {
  onContent: (content: string) => void;
  onThinking?: (thinking: string) => void;
  onToolCallStart?: (toolCall: ToolCall) => void;
  onToolCallEnd?: () => void;
  onError?: (error: Error) => void;
  onDone?: () => void;
  onUsage?: (usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) => void;
}

/**
 * Send streaming chat completion request to Magpie
 */
export async function streamChatCompletion(
  endpoint: string,
  request: ChatCompletionRequest,
  gatewayKey: string | undefined,
  upstreamKey: string | undefined,
  callbacks: StreamCallbacks,
  cancellationToken?: vscode.CancellationToken
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (gatewayKey) {
    headers['Authorization'] = `Bearer ${gatewayKey}`;
  }
  if (upstreamKey) {
    headers['x-api-key'] = upstreamKey;
  }

  if (isDebugMode()) {
    console.log('[Magpie Relay] Request:', JSON.stringify(request, null, 2));
  }

  const controller = new AbortController();

  // Handle cancellation
  if (cancellationToken) {
    cancellationToken.onCancellationRequested(() => {
      controller.abort();
    });
  }

  try {
    const response = await fetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...request,
        stream: true,
        stream_options: { include_usage: true }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
    }

    const body = response.body;
    if (!body) {
      throw new Error('No response body');
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentToolCall: ToolCall | null = null;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const data = line.slice(6);
        if (data === '[DONE]') {
          callbacks.onDone?.();
          return;
        }

        try {
          const chunk: StreamResponse = JSON.parse(data);

          // Handle usage
          if (chunk.usage) {
            callbacks.onUsage?.(chunk.usage);
          }

          // Handle delta content
          const delta = chunk.choices?.[0]?.delta;
          if (delta) {
            // Reasoning/thinking content
            if (delta.reasoning && callbacks.onThinking) {
              callbacks.onThinking(delta.reasoning);
            }

            // Text content
            if (delta.content) {
              callbacks.onContent(delta.content);
            }

            // Tool calls
            if (delta.tool_calls && delta.tool_calls.length > 0) {
              for (const toolCall of delta.tool_calls) {
                if (!currentToolCall || currentToolCall.id !== toolCall.id) {
                  // Start new tool call
                  if (currentToolCall) {
                    callbacks.onToolCallEnd?.();
                  }
                  currentToolCall = {
                    id: toolCall.id,
                    type: 'function',
                    function: {
                      name: toolCall.function?.name || '',
                      arguments: toolCall.function?.arguments || ''
                    }
                  };
                  callbacks.onToolCallStart?.(currentToolCall);
                } else {
                  // Continue current tool call
                  currentToolCall.function.arguments += toolCall.function?.arguments || '';
                }
              }
            }
          }

          // Handle finish
          if (chunk.choices?.[0]?.finish_reason) {
            if (currentToolCall) {
              callbacks.onToolCallEnd?.();
              currentToolCall = null;
            }
          }
        } catch (parseError) {
          if (isDebugMode()) {
            console.log('[Magpie Relay] Parse error:', parseError);
          }
        }
      }
    }

    callbacks.onDone?.();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      callbacks.onDone?.();
      return;
    }
    callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Prepare chat request from VS Code parameters
 */
export async function prepareChatRequest(
  authManager: AuthManager,
  modelId: string,
  messages: readonly vscode.LanguageModelChatMessage[],
  options: vscode.ProvideLanguageModelChatResponseOptions,
  token: vscode.CancellationToken
): Promise<{ request: ChatCompletionRequest; gatewayKey: string | undefined; upstreamKey: string | undefined }> {
  const gatewayKey = await authManager.getGatewayKey();
  const upstreamKey = await authManager.getUpstreamKey();
  const endpoint = getEndpoint();

  if (!gatewayKey && !upstreamKey) {
    throw new Error('请先设置 Magpie 网关密钥');
  }

  // Convert messages
  const convertedMessages = convertMessages(messages);

  // Build request
  const request: ChatCompletionRequest = {
    model: modelId,
    messages: convertedMessages,
    max_tokens: getMaxTokens(),
    reasoning_effort: getReasoningEffort()
  };

  // Add tools if provided
  if (options.tools && options.tools.length > 0) {
    request.tools = convertTools(options.tools);
    request.tool_choice = 'auto';
  }

  return { request, gatewayKey, upstreamKey };
}
