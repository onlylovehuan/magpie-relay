"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamChatCompletion = streamChatCompletion;
exports.prepareChatRequest = prepareChatRequest;
const vscode = __importStar(require("vscode"));
const config_js_1 = require("../config.js");
const convert_js_1 = require("./convert.js");
/**
 * Send streaming chat completion request to Magpie
 */
async function streamChatCompletion(endpoint, request, gatewayKey, upstreamKey, callbacks, cancellationToken) {
    const headers = {
        'Content-Type': 'application/json'
    };
    if (gatewayKey) {
        headers['Authorization'] = `Bearer ${gatewayKey}`;
    }
    if (upstreamKey) {
        headers['x-api-key'] = upstreamKey;
    }
    if ((0, config_js_1.isDebugMode)()) {
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
        let currentToolCall = null;
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (!line.startsWith('data: '))
                    continue;
                const data = line.slice(6);
                if (data === '[DONE]') {
                    callbacks.onDone?.();
                    return;
                }
                try {
                    const chunk = JSON.parse(data);
                    // Handle usage
                    if (chunk.usage) {
                        callbacks.onUsage?.(chunk.usage);
                    }
                    // Handle delta content
                    const delta = chunk.choices?.[0]?.delta;
                    if (delta) {
                        // Reasoning/thinking content
                        if (delta.reasoning) {
                            callbacks.progress?.report(new vscode.LanguageModelThinkingPart(delta.reasoning));
                            callbacks.onThinking?.(delta.reasoning);
                        }
                        // Text content — report immediately via progress (streaming)
                        if (delta.content) {
                            callbacks.progress?.report(new vscode.LanguageModelTextPart(delta.content));
                            callbacks.onContent?.(delta.content);
                        }
                        // Tool calls — report via progress when complete
                        if (delta.tool_calls && delta.tool_calls.length > 0) {
                            for (const toolCall of delta.tool_calls) {
                                if (!currentToolCall || currentToolCall.id !== toolCall.id) {
                                    // Start new tool call
                                    if (currentToolCall) {
                                        callbacks.onToolCallEnd?.();
                                        // Report completed tool call via progress
                                        try {
                                            callbacks.progress?.report(new vscode.LanguageModelToolCallPart(currentToolCall.id, currentToolCall.function.name, JSON.parse(currentToolCall.function.arguments)));
                                        }
                                        catch {
                                            callbacks.progress?.report(new vscode.LanguageModelToolCallPart(currentToolCall.id, currentToolCall.function.name, {}));
                                        }
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
                                }
                                else {
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
                            // Report final tool call via progress
                            try {
                                callbacks.progress?.report(new vscode.LanguageModelToolCallPart(currentToolCall.id, currentToolCall.function.name, JSON.parse(currentToolCall.function.arguments)));
                            }
                            catch {
                                callbacks.progress?.report(new vscode.LanguageModelToolCallPart(currentToolCall.id, currentToolCall.function.name, {}));
                            }
                            currentToolCall = null;
                        }
                    }
                }
                catch (parseError) {
                    if ((0, config_js_1.isDebugMode)()) {
                        console.log('[Magpie Relay] Parse error:', parseError);
                    }
                }
            }
        }
        callbacks.onDone?.();
    }
    catch (error) {
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
async function prepareChatRequest(authManager, modelId, messages, options, token) {
    const gatewayKey = await authManager.getGatewayKey();
    const upstreamKey = await authManager.getUpstreamKey();
    const endpoint = (0, config_js_1.getEndpoint)();
    if (!gatewayKey && !upstreamKey) {
        throw new Error('请先设置 Magpie 网关密钥');
    }
    // Convert messages
    const convertedMessages = (0, convert_js_1.convertMessages)(messages);
    // Build request
    const request = {
        model: modelId,
        messages: convertedMessages,
        max_tokens: (0, config_js_1.getMaxTokens)(),
        reasoning_effort: (0, config_js_1.getReasoningEffort)()
    };
    // Add tools if provided
    if (options.tools && options.tools.length > 0) {
        request.tools = (0, convert_js_1.convertTools)(options.tools);
        request.tool_choice = 'auto';
    }
    return { request, gatewayKey, upstreamKey };
}
