import * as vscode from 'vscode';

export const CONFIG_SECTION = 'magpie-relay';
export const EXTENSION_ID = 'magpie-relay';

// Secret storage keys
export const SECRET_GATEWAY_KEY = 'magpie.gatewayKey';
export const SECRET_UPSTREAM_KEY = 'magpie.upstreamKey';

// Default values
export const DEFAULT_ENDPOINT = 'http://127.0.0.1:3425';

// Error messages
export const ERROR_ENDPOINT_NOT_SET = '请先设置 Magpie 网关地址';
export const ERROR_GATEWAY_KEY_NOT_SET = '请先设置 Magpie 网关密钥';
export const ERROR_API_FAILED = 'API 请求失败';
export const ERROR_NETWORK = '网络连接失败，请检查网关是否运行';
