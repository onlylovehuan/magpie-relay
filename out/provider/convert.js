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
/**
 * Convert VS Code message format to OpenAI-compatible format
 */
function convertMessages(messages) {
    const result = [];
    for (const message of messages) {
        let role;
        if (message.role === 1) {
            role = 'user';
        }
        else if (message.role === 2) {
            role = 'assistant';
        }
        else {
            role = 'user'; // Default fallback
        }
        // Process content parts
        const parts = [];
        for (const part of message.content) {
            if (part instanceof vscode.LanguageModelTextPart) {
                parts.push({ type: 'text', text: part.value });
            }
            else if (part instanceof vscode.LanguageModelDataPart) {
                // Check if it's an image based on mime type
                if (part.mimeType?.startsWith('image/')) {
                    parts.push({
                        type: 'image_url',
                        image_url: {
                            url: `data:${part.mimeType};base64,${part.data}`,
                            detail: 'auto'
                        }
                    });
                }
                else {
                    // Treat as text
                    parts.push({ type: 'text', text: part.data.toString() });
                }
            }
        }
        if (parts.length === 0) {
            result.push({ role, content: '' });
        }
        else if (parts.length === 1 && parts[0].type === 'text') {
            result.push({ role, content: parts[0].text });
        }
        else {
            result.push({ role, content: parts });
        }
    }
    return result;
}
/**
 * Convert VS Code tool definitions to OpenAI format
 */
function convertTools(tools) {
    return tools.map(tool => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
        }
    }));
}
