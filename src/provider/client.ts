import type { CancellationToken } from 'vscode';
import { createHttpError, normalizeRequestError } from '../errors.js';
import { logger } from '../logger.js';
import { safeStringify } from '../json.js';
import type {
  ChatCompletionRequest,
  ChatUsage,
  MagpieModelsResponse,
  StreamResponse,
  ToolCall,
  StreamDelta,
} from '../types.js';

export interface MagpieAuth {
  gatewayKey?: string;
  upstreamKey?: string;
}

export interface StreamCallbacks {
  onContent?: (content: string) => void;
  onThinking?: (thinking: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onError?: (error: Error) => void;
  onDone?: () => void;
  onUsage?: (usage: ChatUsage) => void;
}

interface ToolCallState {
  id: string;
  name: string;
  arguments: string;
}

const USER_AGENT = 'magpie-relay-vscode/0.2.0';

export class MagpieClient {
  private readonly endpoint: string;
  private readonly auth: MagpieAuth;

  constructor(endpoint: string, auth: MagpieAuth) {
    this.endpoint = normalizeEndpoint(endpoint);
    this.auth = auth;
  }

  async listModels(token?: CancellationToken): Promise<MagpieModelsResponse> {
    const controller = new AbortController();
    const listener = token?.onCancellationRequested(() => controller.abort());
    if (token?.isCancellationRequested) controller.abort();

    try {
      const response = await fetch(`${this.endpoint}/v1/models`, {
        method: 'GET',
        headers: this.headers(),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw await createHttpError(response, { endpoint: this.endpoint });
      }
      const data = await response.json() as MagpieModelsResponse;
      if (!Array.isArray(data?.data)) {
        throw new Error('Magpie model catalog response does not contain a data array');
      }
      return data;
    } catch (error) {
      throw normalizeRequestError(error, { endpoint: this.endpoint });
    } finally {
      listener?.dispose();
    }
  }

  async streamChatCompletion(
    request: ChatCompletionRequest,
    callbacks: StreamCallbacks,
    token?: CancellationToken,
  ): Promise<void> {
    const controller = new AbortController();
    const listener = token?.onCancellationRequested(() => controller.abort());
    if (token?.isCancellationRequested) controller.abort();

    try {
      const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: this.headers({ accept: 'text/event-stream' }),
        body: safeStringify({
          ...request,
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw await createHttpError(response, {
          endpoint: this.endpoint,
          model: request.model,
        });
      }
      if (!response.body) throw new Error('Magpie returned no response body');

      await this.consumeStream(response.body, callbacks, token);
      if (token?.isCancellationRequested) {
        controller.abort();
        return;
      }
    } catch (error) {
      if (isAbortError(error) && token?.isCancellationRequested) return;
      const normalized = normalizeRequestError(error, {
        endpoint: this.endpoint,
        model: request.model,
      });
      logger.error('Magpie stream failed', normalized);
      callbacks.onError?.(normalized);
    } finally {
      listener?.dispose();
    }
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      ...extra,
    };
    if (this.auth.gatewayKey) {
      headers.Authorization = `Bearer ${this.auth.gatewayKey}`;
    }
    if (this.auth.upstreamKey) {
      headers['x-api-key'] = this.auth.upstreamKey;
    }
    return headers;
  }

  private async consumeStream(
    body: ReadableStream<Uint8Array>,
    callbacks: StreamCallbacks,
    token?: CancellationToken,
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let latestUsage: ChatUsage | undefined;
    let finished = false;
    const pendingToolCalls = new Map<number, ToolCallState>();

    const finish = (): void => {
      if (finished) return;
      finished = true;
      flushToolCalls(pendingToolCalls, callbacks);
      if (latestUsage) callbacks.onUsage?.(latestUsage);
      callbacks.onDone?.();
    };

    try {
      while (!token?.isCancellationRequested && !finished) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || line.startsWith(':')) continue;
          if (!line.startsWith('data:')) continue;

          const payload = line.slice(5).trim();
          if (payload === '[DONE]') {
            finish();
            return;
          }

          try {
            const chunk = JSON.parse(payload) as StreamResponse;
            if (chunk.usage) latestUsage = chunk.usage;
            this.dispatchChunk(chunk, pendingToolCalls, callbacks);
            const choice = getPrimaryChoice(chunk);
            if (choice?.finish_reason) {
              flushToolCalls(pendingToolCalls, callbacks);
            }
          } catch (error) {
            logger.warn('Failed to parse Magpie SSE chunk', payload.slice(0, 300), error);
          }
        }
      }
      finish();
    } finally {
      if (!finished) finish();
      reader.cancel().catch(() => undefined);
    }
  }

  private dispatchChunk(
    chunk: StreamResponse,
    pendingToolCalls: Map<number, ToolCallState>,
    callbacks: StreamCallbacks,
  ): void {
    const choice = getPrimaryChoice(chunk);
    if (!choice) return;

    const reasoning = extractThinking(choice.delta);
    if (reasoning) callbacks.onThinking?.(reasoning);
    if (choice.delta.content) callbacks.onContent?.(choice.delta.content);
    if (choice.delta.tool_calls) {
      accumulateToolCalls(pendingToolCalls, choice.delta.tool_calls);
    }
  }
}

function getPrimaryChoice(chunk: StreamResponse) {
  return chunk.choices?.find(choice => choice.index === 0) ?? chunk.choices?.[0];
}

function extractThinking(delta: { reasoning?: unknown; reasoning_content?: unknown }): string {
  return normalizeText(delta.reasoning_content) || normalizeText(delta.reasoning);
}

function normalizeText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(part => normalizeText(part)).join('');
  return '';
}

function accumulateToolCalls(
  pending: Map<number, ToolCallState>,
  deltas: NonNullable<StreamDelta['tool_calls']>,
): void {
  for (const [position, delta] of deltas.entries()) {
    const index = typeof delta.index === 'number' && Number.isInteger(delta.index) && delta.index >= 0
      ? delta.index
      : pending.size + position;
    let state = pending.get(index);
    if (!state) {
      state = {
        id: delta.id ?? `magpie_call_${index}`,
        name: '',
        arguments: '',
      };
      pending.set(index, state);
    }
    if (delta.id) state.id = delta.id;
    if (delta.function?.name) state.name += delta.function.name;
    if (delta.function?.arguments) state.arguments += delta.function.arguments;
  }
}

function flushToolCalls(
  pending: Map<number, ToolCallState>,
  callbacks: StreamCallbacks,
): void {
  if (pending.size === 0) return;
  for (const [index, state] of pending) {
    callbacks.onToolCall?.({
      id: state.id || `magpie_call_${index}`,
      type: 'function',
      function: {
        name: state.name || `tool_${index}`,
        arguments: state.arguments || '{}',
      },
    });
  }
  pending.clear();
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function normalizeEndpoint(endpoint: string): string {
  const parsed = new URL(endpoint);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Magpie endpoint must use http or https');
  }
  return parsed.toString().replace(/\/+$/, '');
}
