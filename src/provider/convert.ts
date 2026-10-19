import * as vscode from 'vscode';
import { ChatMessage, ChatContentPart, ToolCall } from '../types.js';

/**
 * Convert VS Code message format to OpenAI-compatible format
 */
export function convertMessages(
  messages: readonly vscode.LanguageModelChatMessage[]
): ChatMessage[] {
  const result: ChatMessage[] = [];

  for (const message of messages) {
    let role: 'system' | 'user' | 'assistant' | 'tool';

    if (message.role === 1 satisfies vscode.LanguageModelChatMessageRole.User) {
      role = 'user';
    } else if (message.role === 2 satisfies vscode.LanguageModelChatMessageRole.Assistant) {
      role = 'assistant';
    } else {
      role = 'user'; // Default fallback
    }

    // Process content parts
    const parts: ChatContentPart[] = [];

    for (const part of message.content) {
      if (part instanceof vscode.LanguageModelTextPart) {
        parts.push({ type: 'text', text: part.value });
      } else if (part instanceof vscode.LanguageModelDataPart) {
        // Check if it's an image based on mime type
        if (part.mimeType?.startsWith('image/')) {
          parts.push({
            type: 'image_url',
            image_url: {
              url: `data:${part.mimeType};base64,${part.data}`,
              detail: 'auto'
            }
          });
        } else {
          // Treat as text
          parts.push({ type: 'text', text: part.data.toString() });
        }
      }
    }

    if (parts.length === 0) {
      result.push({ role, content: '' });
    } else if (parts.length === 1 && parts[0].type === 'text') {
      result.push({ role, content: parts[0].text! });
    } else {
      result.push({ role, content: parts });
    }
  }

  return result;
}

/**
 * Convert VS Code tool definitions to OpenAI format
 */
export function convertTools(
  tools: readonly vscode.LanguageModelChatTool[]
): any[] {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    }
  }));
}
