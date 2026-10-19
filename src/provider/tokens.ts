import * as vscode from 'vscode';
import type { ChatMessage } from '../types.js';

export function countMessageChars(messages: readonly ChatMessage[]): number {
  let total = 0;
  for (const message of messages) {
    total += getContentChars(message.content);
    total += message.reasoning_content?.length ?? 0;
    if (message.tool_calls) {
      for (const call of message.tool_calls) {
        total += call.function.name.length + call.function.arguments.length;
      }
    }
  }
  return total;
}

export function estimateTokenCount(
  text: string | vscode.LanguageModelChatRequestMessage,
  charsPerToken: number,
): number {
  if (typeof text === 'string') return estimateFromChars(text.length, charsPerToken);

  let chars = 0;
  for (const part of text.content) {
    if (part instanceof vscode.LanguageModelTextPart) {
      chars += part.value.length;
    } else if (part instanceof vscode.LanguageModelThinkingPart) {
      chars += normalizeThinkingText(part.value).length;
    } else if (part instanceof vscode.LanguageModelToolCallPart) {
      chars += part.callId.length + part.name.length + safeJsonLength(part.input);
    } else if (part instanceof vscode.LanguageModelToolResultPart) {
      chars += part.callId.length + countToolResultChars(part.content);
    } else if (part instanceof vscode.LanguageModelDataPart) {
      chars += part.mimeType.startsWith('image/')
        ? 1024
        : Math.ceil(part.data.byteLength / 4);
    }
  }
  return estimateFromChars(chars, charsPerToken);
}

function getContentChars(content: ChatMessage['content']): number {
  if (typeof content === 'string' || content === null) return content?.length ?? 0;
  return content.reduce((total, part) => {
    if (part.type === 'text') return total + (part.text?.length ?? 0);
    if (part.type === 'image_url') return total + 1024;
    return total;
  }, 0);
}

function countToolResultChars(content: readonly unknown[]): number {
  let chars = 0;
  for (const item of content) {
    if (item instanceof vscode.LanguageModelTextPart) chars += item.value.length;
    else if (item instanceof vscode.LanguageModelDataPart && item.mimeType.startsWith('image/')) chars += 1024;
    else chars += safeJsonLength(item);
  }
  return chars;
}

function estimateFromChars(chars: number, charsPerToken: number): number {
  return Math.max(1, Math.ceil(chars / Math.max(1, charsPerToken)));
}

function safeJsonLength(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

function normalizeThinkingText(value: string | readonly string[]): string {
  return Array.isArray(value) ? value.join('') : String(value);
}
