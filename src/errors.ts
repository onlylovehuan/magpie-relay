import { safeStringify } from './json.js';

export type MagpieErrorKind = 'auth' | 'http' | 'network' | 'request' | 'unknown';

export class MagpieRelayError extends Error {
  readonly kind: MagpieErrorKind;
  readonly userSummary: string;
  readonly diagnosticMessage: string;
  readonly status?: number;

  constructor(options: {
    kind: MagpieErrorKind;
    message: string;
    userSummary?: string;
    diagnosticMessage?: string;
    status?: number;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'MagpieRelayError';
    this.kind = options.kind;
    this.userSummary = options.userSummary ?? options.message;
    this.diagnosticMessage = options.diagnosticMessage ?? options.message;
    this.status = options.status;
  }
}

export async function createHttpError(
  response: Response,
  context: { endpoint: string; model?: string },
): Promise<MagpieRelayError> {
  const responseText = await response.text().catch(() => '');
  const serverMessage = extractServerMessage(responseText);
  const userSummary = getHttpErrorMessage(response.status, serverMessage);

  return new MagpieRelayError({
    kind: response.status === 401 || response.status === 403 ? 'auth' : 'http',
    message: `Magpie API request failed with HTTP ${response.status}`,
    userSummary,
    status: response.status,
    diagnosticMessage: [
      `kind=http`,
      `status=${response.status}`,
      `endpoint=${context.endpoint}`,
      context.model ? `model=${context.model}` : undefined,
      serverMessage ? `serverMessage=${safeStringify(serverMessage)}` : undefined,
      responseText ? `body=${safeStringify(truncate(responseText))}` : undefined,
    ].filter(Boolean).join(' | '),
  });
}

export function normalizeRequestError(
  error: unknown,
  context: { endpoint: string; model?: string },
): Error {
  if (error instanceof MagpieRelayError) return error;
  if (error instanceof Error) {
    const code = getErrorCode(error);
    if (!code) return error;

    const category = getNetworkCategory(code);
    return new MagpieRelayError({
      kind: 'network',
      message: `Magpie request failed due to network error ${code}`,
      userSummary: `网络连接失败（${code}），请确认 Magpie 正在运行且地址正确。`,
      cause: error,
      diagnosticMessage: [
        `kind=network`,
        `code=${code}`,
        `category=${category}`,
        `endpoint=${context.endpoint}`,
        context.model ? `model=${context.model}` : undefined,
      ].filter(Boolean).join(' | '),
    });
  }

  return new MagpieRelayError({
    kind: 'unknown',
    message: `Magpie request failed with a non-Error value: ${safeStringify(error)}`,
    userSummary: 'Magpie 请求失败，请查看 Magpie Relay 输出日志。',
  });
}

export function createUserFacingError(error: Error): Error {
  const displayError = new Error(
    error instanceof MagpieRelayError ? error.userSummary : error.message,
  );
  displayError.stack = undefined;
  return displayError;
}

function getErrorCode(error: Error): string | undefined {
  const cause = (error as Error & { cause?: unknown }).cause;
  const source = cause instanceof Error ? cause : error;
  return (source as Error & { code?: string }).code ?? source.name;
}

function getNetworkCategory(code: string): string {
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns';
  if (code === 'ECONNREFUSED') return 'unreachable';
  if (code === 'ECONNRESET') return 'interrupted';
  if (code === 'ETIMEDOUT') return 'timeout';
  if (code.startsWith('ERR_TLS_') || code.startsWith('ERR_SSL_')) return 'tls';
  return 'generic';
}

function getHttpErrorMessage(status: number, serverMessage?: string): string {
  const detail = serverMessage ? `: ${serverMessage}` : '';
  switch (status) {
    case 401:
      return `Magpie 认证失败（401），请检查网关密钥。${detail}`;
    case 403:
      return `Magpie 拒绝访问（403），请检查密钥权限和模型可见性。${detail}`;
    case 404:
      return `Magpie 模型或接口不存在（404），请刷新模型列表。${detail}`;
    case 429:
      return `Magpie 请求频率或配额受限（429）。${detail}`;
    case 500:
    case 502:
    case 503:
    case 504:
      return `Magpie 或上游服务暂时不可用（${status}）。${detail}`;
    default:
      return `Magpie API 请求失败（${status}）${detail}`;
  }
}

function extractServerMessage(responseText: string): string | undefined {
  const trimmed = responseText.trim();
  if (!trimmed) return undefined;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null) return truncate(trimmed);
    const record = parsed as Record<string, unknown>;
    const error = typeof record.error === 'object' && record.error !== null
      ? record.error as Record<string, unknown>
      : undefined;
    const message = error?.message ?? record.message;
    return typeof message === 'string' ? truncate(message) : truncate(trimmed);
  } catch {
    return truncate(trimmed);
  }
}

function truncate(value: string, length = 500): string {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}
