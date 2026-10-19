"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERROR_NETWORK = exports.ERROR_API_FAILED = exports.ERROR_GATEWAY_KEY_NOT_SET = exports.ERROR_ENDPOINT_NOT_SET = exports.DEFAULT_ENDPOINT = exports.SECRET_UPSTREAM_KEY = exports.SECRET_GATEWAY_KEY = exports.EXTENSION_ID = exports.CONFIG_SECTION = void 0;
exports.CONFIG_SECTION = 'magpie-relay';
exports.EXTENSION_ID = 'magpie-relay';
// Secret storage keys
exports.SECRET_GATEWAY_KEY = 'magpie.gatewayKey';
exports.SECRET_UPSTREAM_KEY = 'magpie.upstreamKey';
// Default values
exports.DEFAULT_ENDPOINT = 'http://127.0.0.1:3425';
// Error messages
exports.ERROR_ENDPOINT_NOT_SET = '请先设置 Magpie 网关地址';
exports.ERROR_GATEWAY_KEY_NOT_SET = '请先设置 Magpie 网关密钥';
exports.ERROR_API_FAILED = 'API 请求失败';
exports.ERROR_NETWORK = '网络连接失败，请检查网关是否运行';
