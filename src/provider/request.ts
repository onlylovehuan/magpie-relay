import * as vscode from 'vscode';
import { AuthManager } from '../auth.js';
import { logger } from '../logger.js';
import {
  getEnableTools,
  getEndpoint,
  getMaxTokens,
  getReasoningEffort,
} from '../config.js';
import type { ModelInfo, ThinkingCapability } from '../types.js';
import { MagpieClient } from './client.js';
import { convertMessages, convertTools } from './convert.js';
import { countMessageChars } from './tokens.js';

export interface PreparedChatRequest {
  client: MagpieClient;
  request: import('../types.js').ChatCompletionRequest;
  totalRequestChars: number;
  isThinkingModel: boolean;
  thinkingEffort: string | undefined;
}

export async function prepareChatRequest(options: {
  authManager: AuthManager;
  modelInfo: vscode.LanguageModelChatInformation;
  modelDefinition?: ModelInfo;
  messages: readonly vscode.LanguageModelChatRequestMessage[];
  requestOptions: vscode.ProvideLanguageModelChatResponseOptions;
  token: vscode.CancellationToken;
}): Promise<PreparedChatRequest> {
  const { authManager, modelInfo, modelDefinition, messages, requestOptions, token } = options;
  const gatewayKey = await authManager.getGatewayKey();
  const upstreamKey = await authManager.getUpstreamKey();
  if (!gatewayKey && !upstreamKey) {
    throw new Error('请先设置 Magpie 网关密钥。');
  }

  const imageInput = modelDefinition?.supportsVision
    ?? modelInfo.capabilities?.imageInput === true;
  const toolCalling = modelDefinition?.supportsToolCalling
    ?? modelInfo.capabilities?.toolCalling !== false;
  const thinkingCapability = resolveThinkingCapability(modelInfo, modelDefinition);
  const thinkingEffort = thinkingCapability
    ? getConfiguredThinkingEffort(requestOptions, thinkingCapability)
    : undefined;
  const isThinkingModel = Boolean(thinkingCapability) && thinkingEffort !== 'none';

  const chatMessages = convertMessages(messages, { imageInput, isThinkingModel });
  const tools = getEnableTools() && toolCalling
    ? convertTools(filterTools(requestOptions.tools))
    : undefined;
  const configuredMaxTokens = getMaxTokens();
  const maxTokens = Math.max(
    16,
    Math.min(configuredMaxTokens, modelDefinition?.maxOutputTokens ?? configuredMaxTokens),
  );

  const request: import('../types.js').ChatCompletionRequest = {
    model: modelInfo.id,
    messages: chatMessages,
    max_tokens: maxTokens,
  };
  if (tools && tools.length > 0) {
    request.tools = tools;
    request.tool_choice = 'auto';
  }
  if (isThinkingModel && thinkingEffort && thinkingEffort !== 'none') {
    request.reasoning_effort = thinkingEffort;
  }

  return {
    client: new MagpieClient(getEndpoint(), { gatewayKey, upstreamKey }),
    request,
    totalRequestChars: countMessageChars(chatMessages),
    isThinkingModel,
    thinkingEffort,
  };
}


export function resolveThinkingCapability(
  modelInfo: vscode.LanguageModelChatInformation,
  modelDefinition?: ModelInfo,
): ThinkingCapability | false {
  if (modelDefinition?.thinking) return modelDefinition.thinking;
  const capabilities = modelInfo.capabilities as { reasoningEfforts?: unknown } | undefined;
  const efforts = capabilities?.reasoningEfforts;
  if (!Array.isArray(efforts) || efforts.length === 0) return false;
  const supportedEfforts = efforts.filter((effort): effort is string => typeof effort === 'string');
  return {
    supportedEfforts: Object.freeze(supportedEfforts),
    defaultEffort: supportedEfforts.includes('medium') ? 'medium' : supportedEfforts[0]!,
    canDisable: false,
  };
}

export function getConfiguredThinkingEffort(
  options: vscode.ProvideLanguageModelChatResponseOptions,
  thinking: ThinkingCapability,
): string | undefined {
  const modelOptions = options as vscode.ProvideLanguageModelChatResponseOptions & {
    modelOptions?: Record<string, unknown>;
    modelConfiguration?: Record<string, unknown>;
    configuration?: Record<string, unknown>;
  };
  const configured = modelOptions.modelOptions?.reasoningEffort
    ?? modelOptions.modelConfiguration?.reasoningEffort
    ?? modelOptions.configuration?.reasoningEffort;

  if (configured === 'none' && thinking.canDisable) return 'none';
  if (typeof configured === 'string' && isSupportedEffort(configured, thinking)) {
    return configured;
  }
  if (configured !== undefined) {
    logger.debug('Ignoring unsupported configured reasoning effort', configured);
  }
  return thinking.defaultEffort;
}

function filterTools(
  tools: readonly vscode.LanguageModelChatTool[] | undefined,
): readonly vscode.LanguageModelChatTool[] {
  return (tools ?? []).filter(tool => !tool.name.startsWith('copilot_'));
}

function isSupportedEffort(value: string, thinking: ThinkingCapability): boolean {
  return thinking.supportedEfforts.includes(value);
}
