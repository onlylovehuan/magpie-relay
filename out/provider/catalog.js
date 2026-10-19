"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseMagpieModel = parseMagpieModel;
exports.fetchModels = fetchModels;
exports.getModels = getModels;
exports.clearModelCache = clearModelCache;
exports.getModelById = getModelById;
const errors_js_1 = require("../errors.js");
const logger_js_1 = require("../logger.js");
const config_js_1 = require("../config.js");
const client_js_1 = require("./client.js");
const CACHE_DURATION_MS = 5 * 60 * 1000;
let cachedModels = [];
let cacheKey = '';
let cacheTime = 0;
let inFlight;
function parseMagpieModel(model) {
    const totalContext = positiveNumber(model.context_window ?? model.context_length ?? model.max_input_tokens) ?? 0;
    const maxOutputTokens = positiveNumber(model.max_output_tokens)
        ?? clamp(Math.round(totalContext / 8), 4096, 131072);
    const maxInputTokens = Math.max(1024, totalContext - maxOutputTokens);
    const rawEfforts = [
        ...(model.supported_reasoning_levels ?? [])
            .map(level => level?.effort)
            .filter((effort) => typeof effort === 'string' && effort.length > 0),
        ...(model.reasoning_levels ?? []),
        ...(model.capabilities?.reasoning_effort ?? []),
    ];
    const enabledEfforts = [...new Set(rawEfforts.filter(effort => effort !== 'none'))];
    const canDisable = rawEfforts.includes('none');
    const thinking = enabledEfforts.length > 0
        ? {
            supportedEfforts: Object.freeze(enabledEfforts),
            defaultEffort: enabledEfforts.includes('medium') ? 'medium' : enabledEfforts[0],
            canDisable,
        }
        : false;
    const supportsToolCalling = model.tool_call !== false
        && model.capabilities?.supports_tool_use !== false;
    const supportsVision = model.modalities?.input?.includes('image') === true
        || model.capabilities?.supports_vision === true;
    return {
        id: model.id,
        name: model.display_name || model.id,
        contextWindow: totalContext,
        maxInputTokens,
        supportsVision,
        supportsToolCalling,
        supportsReasoning: model.reasoning === true || enabledEfforts.length > 0,
        reasoningEfforts: thinking ? [...thinking.supportedEfforts] : undefined,
        maxOutputTokens,
        thinking,
    };
}
async function fetchModels(endpoint, authManager, token) {
    const gatewayKey = await authManager.getGatewayKey();
    const upstreamKey = await authManager.getUpstreamKey();
    if (!gatewayKey && !upstreamKey) {
        throw new errors_js_1.MagpieRelayError({
            kind: 'auth',
            message: 'Magpie gateway key is not configured',
            userSummary: '请先设置 Magpie 网关密钥。',
        });
    }
    const client = new client_js_1.MagpieClient(endpoint, { gatewayKey, upstreamKey });
    const response = await client.listModels(token);
    const models = [
        ...new Map(response.data.map(parseMagpieModel).map(model => [model.id, model])).values(),
    ];
    if (models.length === 0) {
        throw new errors_js_1.MagpieRelayError({
            kind: 'request',
            message: 'Magpie returned an empty model catalog',
            userSummary: 'Magpie 没有返回可用模型，请检查已在 Magpie 中开启的模型。',
        });
    }
    return models;
}
async function getModels(authManager, forceRefresh = false, token) {
    const endpoint = (0, config_js_1.getEndpoint)();
    const now = Date.now();
    if (!forceRefresh
        && cacheKey === endpoint
        && cachedModels.length > 0
        && now - cacheTime < CACHE_DURATION_MS) {
        return cachedModels;
    }
    if (!forceRefresh && inFlight)
        return inFlight;
    const request = fetchModels(endpoint, authManager, token)
        .then(models => {
        cachedModels = models;
        cacheKey = endpoint;
        cacheTime = Date.now();
        if ((0, config_js_1.isDebugMode)())
            logger_js_1.logger.debug(`Fetched ${models.length} Magpie models`);
        return models;
    })
        .finally(() => {
        inFlight = undefined;
    });
    inFlight = request;
    return request;
}
function clearModelCache() {
    cachedModels = [];
    cacheKey = '';
    cacheTime = 0;
}
async function getModelById(id, authManager) {
    const models = await getModels(authManager);
    return models.find(model => model.id === id);
}
function positiveNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
