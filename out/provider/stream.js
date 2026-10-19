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
const vscode = __importStar(require("vscode"));
const errors_js_1 = require("../errors.js");
const logger_js_1 = require("../logger.js");
const COPILOT_USAGE_DATA_PART_MIME = 'usage';
function streamChatCompletion(options) {
    const { prepared, progress, token } = options;
    return prepared.client.streamChatCompletion(prepared.request, {
        onContent: content => {
            progress.report(new vscode.LanguageModelTextPart(content));
        },
        onThinking: thinking => {
            progress.report(new vscode.LanguageModelThinkingPart(thinking));
        },
        onToolCall: toolCall => {
            progress.report(createToolCallPart(toolCall.id, toolCall.function.name, toolCall.function.arguments));
        },
        onError: error => {
            throw (0, errors_js_1.createUserFacingError)(error);
        },
        onUsage: usage => {
            reportUsage(usage, prepared.totalRequestChars, progress, options);
        },
    }, token);
}
function createToolCallPart(callId, name, argumentsText) {
    try {
        return new vscode.LanguageModelToolCallPart(callId, name, JSON.parse(argumentsText));
    }
    catch (error) {
        logger_js_1.logger.warn('Failed to parse Magpie tool-call arguments', argumentsText, error);
        return new vscode.LanguageModelToolCallPart(callId, name, {});
    }
}
function reportUsage(usage, totalRequestChars, progress, options) {
    const charsPerToken = updateCharsPerToken(totalRequestChars, usage.prompt_tokens, options.getCharsPerToken());
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
        progress.report(new vscode.LanguageModelDataPart(new TextEncoder().encode(JSON.stringify(data)), COPILOT_USAGE_DATA_PART_MIME));
    }
    catch (error) {
        logger_js_1.logger.warn('Failed to report Magpie usage to Copilot', error);
    }
}
function updateCharsPerToken(totalRequestChars, promptTokens, charsPerToken) {
    if (totalRequestChars <= 0 || promptTokens <= 0)
        return charsPerToken;
    const observed = totalRequestChars / promptTokens;
    return charsPerToken * 0.7 + observed * 0.3;
}
