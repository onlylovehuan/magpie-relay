export function safeStringify(value: unknown): string {
  return JSON.stringify(value, (_key, inner) => {
    if (inner instanceof Error) {
      return {
        name: inner.name,
        message: inner.message,
        ...(inner.stack ? { stack: inner.stack } : {}),
      };
    }
    return inner;
  }) ?? 'undefined';
}
