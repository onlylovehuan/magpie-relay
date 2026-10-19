import * as vscode from 'vscode';
import { logger } from '../logger.js';
import { safeStringify } from '../json.js';
import type {
  ChatContentPart,
  ChatMessage,
  ChatTool,
  ChatToolCall,
  ToolDefinition,
} from '../types.js';

export interface ConvertMessagesOptions {
  imageInput: boolean;
  isThinkingModel: boolean;
}

interface ToolResult {
  callId: string;
  content: string | ChatContentPart[];
}

export function convertMessages(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  options: ConvertMessagesOptions,
): ChatMessage[] {
  const result: ChatMessage[] = [];

  for (const message of messages) {
    const role = mapRole(message.role);
    const textSegments: string[] = [];
    const imageParts: ChatContentPart[] = [];
    const toolCalls: ChatToolCall[] = [];
    const toolResults: ToolResult[] = [];
    let thinkingContent = '';

    for (const part of message.content) {
      if (part instanceof vscode.LanguageModelTextPart) {
        textSegments.push(part.value);
      } else if (isThinkingPart(part)) {
        thinkingContent += normalizeThinkingText(part.value);
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        toolCalls.push({
          id: part.callId,
          type: 'function',
          function: {
            name: part.name,
            arguments: safeStringify(part.input ?? {}),
          },
        });
      } else if (part instanceof vscode.LanguageModelToolResultPart) {
        toolResults.push({
          callId: part.callId,
          content: convertToolResult(part, options.imageInput),
        });
      } else if (part instanceof vscode.LanguageModelDataPart && part.mimeType.startsWith('image/')) {
        if (!options.imageInput) {
          logger.warn(
            `Dropping image part (${part.mimeType}, ${part.data.byteLength} bytes): model does not advertise image input`,
          );
          continue;
        }
        imageParts.push({
          type: 'image_url',
          image_url: {
            url: toDataUrl(part.mimeType, part.data),
            detail: 'auto',
          },
        });
      }
    }

    const text = textSegments.join('');

    if (role === 'assistant') {
      if (text || toolCalls.length > 0) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: text,
        };
        if (toolCalls.length > 0) assistantMessage.tool_calls = toolCalls;
        if (options.isThinkingModel && thinkingContent) {
          assistantMessage.reasoning_content = thinkingContent;
        }
        result.push(assistantMessage);
      }
    } else if (text || imageParts.length > 0) {
      result.push({
        role: 'user',
        content: imageParts.length > 0
          ? [
              ...(text ? [{ type: 'text', text } as ChatContentPart] : []),
              ...imageParts,
            ]
          : text,
      });
    }

    for (const toolResult of toolResults) {
      result.push({
        role: 'tool',
        content: toolResult.content,
        tool_call_id: toolResult.callId,
      });
    }
  }

  return result;
}

export function convertTools(
  tools: readonly vscode.LanguageModelChatTool[] | undefined,
): ChatTool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: normalizeToolSchema(tool.inputSchema),
    },
  }));
}

function normalizeToolSchema(schema: unknown): ToolDefinition['function']['parameters'] {
  if (typeof schema === 'object' && schema !== null) {
    const candidate = schema as ToolDefinition['function']['parameters'];
    if (candidate.type === 'object') return candidate;
  }
  return { type: 'object', properties: {} };
}

function convertToolResult(
  part: vscode.LanguageModelToolResultPart,
  imageInput: boolean,
): string | ChatContentPart[] {
  const textSegments: string[] = [];
  const imageParts: ChatContentPart[] = [];
  const otherParts: unknown[] = [];

  for (const item of part.content) {
    if (item instanceof vscode.LanguageModelTextPart) {
      textSegments.push(item.value);
    } else if (item instanceof vscode.LanguageModelDataPart && item.mimeType.startsWith('image/')) {
      if (imageInput) {
        imageParts.push({
          type: 'image_url',
          image_url: { url: toDataUrl(item.mimeType, item.data) },
        });
      } else {
        logger.warn(`Dropping tool-result image (${item.mimeType}): model does not advertise image input`);
      }
    } else {
      otherParts.push(item);
    }
  }

  if (imageParts.length > 0) {
    return [
      ...(textSegments.join('') ? [{ type: 'text', text: textSegments.join('') } as ChatContentPart] : []),
      ...imageParts,
    ];
  }

  const text = textSegments.join('');
  if (text) return text;
  if (otherParts.length > 0) return safeStringify(otherParts);
  return '';
}

function isThinkingPart(part: unknown): part is vscode.LanguageModelThinkingPart {
  return typeof vscode.LanguageModelThinkingPart === 'function'
    && part instanceof vscode.LanguageModelThinkingPart;
}

function normalizeThinkingText(value: string | readonly string[]): string {
  return Array.isArray(value) ? value.join('') : String(value);
}

function toDataUrl(mimeType: string, data: Uint8Array): string {
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function mapRole(role: vscode.LanguageModelChatMessageRole): 'user' | 'assistant' {
  if (role === vscode.LanguageModelChatMessageRole.Assistant) return 'assistant';
  return 'user';
}
