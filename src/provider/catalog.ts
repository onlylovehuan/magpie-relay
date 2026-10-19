import { MagpieModelsResponse, ModelInfo, MagpieModel } from '../types.js';
import { getEndpoint, isDebugMode } from '../config.js';
import { AuthManager } from '../auth.js';

/**
 * Parse Magpie model to VS Code compatible format
 */
function parseMagpieModel(model: MagpieModel): ModelInfo {
  const hasImageInput = model.modalities?.input?.includes('image') ?? false;

  const hasReasoning = model.reasoning === true ||
    (model.supported_reasoning_levels !== undefined && model.supported_reasoning_levels.length > 0) ||
    (model.reasoning_levels !== undefined && model.reasoning_levels.length > 0);

  return {
    id: model.id,
    name: model.display_name || model.id,
    contextWindow: model.context_window || model.context_length || 4096,
    supportsVision: hasImageInput,
    supportsToolCalling: true,
    supportsReasoning: hasReasoning,
    reasoningEfforts: model.supported_reasoning_levels?.map(r => r.effort) ||
                     model.reasoning_levels ||
                     undefined,
    maxOutputTokens: model.max_output_tokens
  };
}

/**
 * Fetch models from Magpie gateway
 */
export async function fetchModels(
  endpoint: string,
  authManager: AuthManager
): Promise<ModelInfo[]> {
  const gatewayKey = await authManager.getGatewayKey();
  const upstreamKey = await authManager.getUpstreamKey();

  if (!gatewayKey && !upstreamKey) {
    throw new Error('请先设置 Magpie 网关密钥');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (gatewayKey) {
    headers['Authorization'] = `Bearer ${gatewayKey}`;
  }
  if (upstreamKey) {
    headers['x-api-key'] = upstreamKey;
  }

  try {
    const response = await fetch(`${endpoint}/v1/models`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('认证失败，请检查网关密钥是否正确');
      }
      throw new Error(`获取模型列表失败: ${response.status}`);
    }

    const data: MagpieModelsResponse = await response.json();

    if (isDebugMode()) {
      console.log('[Magpie Relay] Fetched models:', data.data.length);
    }

    return data.data.map(parseMagpieModel);
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('网络连接失败，请检查 Magpie 网关是否运行');
    }
    throw error;
  }
}

const CACHE_DURATION_MS = 5 * 60 * 1000;

let cachedModels: ModelInfo[] = [];
let cacheTime = 0;

export async function getModels(
  authManager: AuthManager,
  forceRefresh = false
): Promise<ModelInfo[]> {
  const endpoint = getEndpoint();
  const now = Date.now();

  if (!forceRefresh && cachedModels.length > 0 && (now - cacheTime) < CACHE_DURATION_MS) {
    return cachedModels;
  }

  const models = await fetchModels(endpoint, authManager);
  cachedModels = models;
  cacheTime = now;

  return models;
}

export function clearModelCache(): void {
  cachedModels = [];
  cacheTime = 0;
}

export async function getModelById(
  id: string,
  authManager: AuthManager
): Promise<ModelInfo | undefined> {
  const models = await getModels(authManager);
  return models.find(m => m.id === id);
}
