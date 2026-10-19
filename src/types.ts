// Magpie API response types

export interface MagpieModel {
  id: string;
  object: string;
  type: string;
  created: number;
  created_at: string;
  owned_by: string;
  display_name: string;
  reasoning?: boolean;
  supported_reasoning_levels?: { effort: string }[];
  reasoning_levels?: string[];
  context_window: number;
  context_length: number;
  max_input_tokens: number;
  max_output_tokens: number;
  native_endpoints?: string[];
  tool_call?: boolean;
  capabilities?: {
    supports_tool_use?: boolean;
    supports_vision?: boolean;
    reasoning_effort?: string[];
  };
  modalities?: {
    input: string[];
    output: string[];
  };
}

export interface MagpieModelsResponse {
  object: string;
  data: MagpieModel[];
  has_more: boolean;
  first_id: string;
  last_id: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null | ChatContentPart[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  reasoning_content?: string;
}

export interface ChatContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolCallDelta {
  index?: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none';
  max_tokens?: number;
  reasoning_effort?: string;
  temperature?: number;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: {
      type: 'object';
      properties?: Record<string, any>;
      required?: string[];
    };
  };
}

export type ChatTool = ToolDefinition;
export type ChatToolCall = ToolCall;

export interface StreamDelta {
  role?: string;
  content?: string;
  tool_calls?: ToolCallDelta[];
  reasoning?: string | string[];
  reasoning_content?: string | string[];
}

export interface StreamChoice {
  index?: number;
  delta: StreamDelta;
  finish_reason?: string;
}

export interface StreamResponse {
  choices?: StreamChoice[];
  usage?: ChatUsage;
}

export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_cache_hit_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
}

// VS Code compatible model info
export interface ThinkingCapability {
	supportedEfforts: readonly string[];
	defaultEffort: string;
	canDisable: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  maxInputTokens: number;
  supportsVision: boolean;
  supportsToolCalling: boolean;
  supportsReasoning: boolean;
  reasoningEfforts?: string[];
  maxOutputTokens?: number;
  thinking?: ThinkingCapability | false;
}

export interface MagpieCapabilities {
  imageInput: boolean;
  toolCalling: boolean;
  thinking: ThinkingCapability | false;
}
