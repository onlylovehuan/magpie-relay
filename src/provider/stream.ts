import * as vscode from 'vscode';
import { createUserFacingError } from '../errors.js';
import { logger } from '../logger.js';
import type { ChatUsage } from '../types.js';
import type { PreparedChatRequest } from './request.js';

const COPILOT_USAGE_DATA_PART_MIME = 'usage';

export interface StreamChatCompletionOptions {
  prepared: PreparedChatRequest;
  progress: vscode.Progress<vscode.LanguageModelResponsePart>;
  token: vscode.CancellationToken;
  getCharsPerToken: () => number;
  setCharsPerToken: (charsPerToken: number) => void;
}

export function streamChatCompletion(options: StreamChatCompletionOptions): Promise<void> {
  const { prepared, progress, token } = options;

  return prepared.client.streamChatCompletion(
    prepared.request,
    {
      onContent: content => {
        progress.report(new vscode.LanguageModelTextPart(content));
      },
      onThinking: thinking => {
        progress.report(
          new vscode.LanguageModelThinkingPart(thinking) as unknown as vscode.LanguageModelResponsePart,
        );
      },
      onToolCall: toolCall => {
        progress.report(createToolCallPart(toolCall.id, toolCall.function.name, toolCall.function.arguments));
      },
      onError: error => {
        throw createUserFacingError(error);
      },
      onUsage: usage => {
        reportUsage(usage, prepared.totalRequestChars, progress, options);
      },
    },
    token,
  );
}

function createToolCallPart(
  callId: string,
  name: string,
  argumentsText: string,
): vscode.LanguageModelToolCallPart {
  try {
    return new vscode.LanguageModelToolCallPart(callId, name, JSON.parse(argumentsText));
  } catch (error) {
    logger.warn('Failed to parse Magpie tool-call arguments', argumentsText, error);
    return new vscode.LanguageModelToolCallPart(callId, name, {});
  }
}

function reportUsage(
  usage: ChatUsage,
  totalRequestChars: number,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  options: StreamChatCompletionOptions,
): void {
  const charsPerToken = updateCharsPerToken(
    totalRequestChars,
    usage.prompt_tokens,
    options.getCharsPerToken(),
  );
  options.setCharsPerToken(charsPerToken);

  const data = {
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    total_tokens: usage.total_tokens,
    prompt_tokens_details: {
      cached_tokens: usage.prompt_cache_hit_tokens
        ?? usage.prompt_tokens_details?.cached_tokens
        ?? 0,
    },
  };

  try {
    progress.report(new vscode.LanguageModelDataPart(
      new TextEncoder().encode(JSON.stringify(data)),
      COPILOT_USAGE_DATA_PART_MIME,
    ));
  } catch (error) {
    logger.warn('Failed to report Magpie usage to Copilot', error);
  }
}

function updateCharsPerToken(
  totalRequestChars: number,
  promptTokens: number,
  charsPerToken: number,
): number {
  if (totalRequestChars <= 0 || promptTokens <= 0) return charsPerToken;
  const observed = totalRequestChars / promptTokens;
  return charsPerToken * 0.7 + observed * 0.3;
}
