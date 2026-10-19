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
exports.convertMessages = convertMessages;
exports.convertTools = convertTools;
const vscode = __importStar(require("vscode"));
const logger_js_1 = require("../logger.js");
const json_js_1 = require("../json.js");
function convertMessages(messages, options) {
    const result = [];
    for (const message of messages) {
        const role = mapRole(message.role);
        const textSegments = [];
        const imageParts = [];
        const toolCalls = [];
        const toolResults = [];
        let thinkingContent = '';
        for (const part of message.content) {
            if (part instanceof vscode.LanguageModelTextPart) {
                textSegments.push(part.value);
            }
            else if (isThinkingPart(part)) {
                thinkingContent += normalizeThinkingText(part.value);
            }
            else if (part instanceof vscode.LanguageModelToolCallPart) {
                toolCalls.push({
                    id: part.callId,
                    type: 'function',
                    function: {
                        name: part.name,
                        arguments: (0, json_js_1.safeStringify)(part.input ?? {}),
                    },
                });
            }
            else if (part instanceof vscode.LanguageModelToolResultPart) {
                toolResults.push({
                    callId: part.callId,
                    content: convertToolResult(part, options.imageInput),
                });
            }
            else if (part instanceof vscode.LanguageModelDataPart && part.mimeType.startsWith('image/')) {
                if (!options.imageInput) {
                    logger_js_1.logger.warn(`Dropping image part (${part.mimeType}, ${part.data.byteLength} bytes): model does not advertise image input`);
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
                const assistantMessage = {
                    role: 'assistant',
                    content: text,
                };
                if (toolCalls.length > 0)
                    assistantMessage.tool_calls = toolCalls;
                if (options.isThinkingModel && thinkingContent) {
                    assistantMessage.reasoning_content = thinkingContent;
                }
                result.push(assistantMessage);
            }
        }
        else if (text || imageParts.length > 0) {
            result.push({
                role: 'user',
                content: imageParts.length > 0
                    ? [
                        ...(text ? [{ type: 'text', text }] : []),
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
function convertTools(tools) {
    if (!tools || tools.length === 0)
        return undefined;
    return tools.map(tool => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: normalizeToolSchema(tool.inputSchema),
        },
    }));
}
function normalizeToolSchema(schema) {
    if (typeof schema === 'object' && schema !== null) {
        const candidate = schema;
        if (candidate.type === 'object')
            return candidate;
    }
    return { type: 'object', properties: {} };
}
function convertToolResult(part, imageInput) {
    const textSegments = [];
    const imageParts = [];
    const otherParts = [];
    for (const item of part.content) {
        if (item instanceof vscode.LanguageModelTextPart) {
            textSegments.push(item.value);
        }
        else if (item instanceof vscode.LanguageModelDataPart && item.mimeType.startsWith('image/')) {
            if (imageInput) {
                imageParts.push({
                    type: 'image_url',
                    image_url: { url: toDataUrl(item.mimeType, item.data) },
                });
            }
            else {
                logger_js_1.logger.warn(`Dropping tool-result image (${item.mimeType}): model does not advertise image input`);
            }
        }
        else {
            otherParts.push(item);
        }
    }
    if (imageParts.length > 0) {
        return [
            ...(textSegments.join('') ? [{ type: 'text', text: textSegments.join('') }] : []),
            ...imageParts,
        ];
    }
    const text = textSegments.join('');
    if (text)
        return text;
    if (otherParts.length > 0)
        return (0, json_js_1.safeStringify)(otherParts);
    return '';
}
function isThinkingPart(part) {
    return typeof vscode.LanguageModelThinkingPart === 'function'
        && part instanceof vscode.LanguageModelThinkingPart;
}
function normalizeThinkingText(value) {
    return Array.isArray(value) ? value.join('') : String(value);
}
function toDataUrl(mimeType, data) {
    let binary = '';
    for (const byte of data)
        binary += String.fromCharCode(byte);
    return `data:${mimeType};base64,${btoa(binary)}`;
}
function mapRole(role) {
    if (role === vscode.LanguageModelChatMessageRole.Assistant)
        return 'assistant';
    return 'user';
}
