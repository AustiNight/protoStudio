export type RuntimeFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function resolveRuntimeFetch(
  override?: RuntimeFetch,
): RuntimeFetch | undefined {
  if (override) {
    return override;
  }
  if (typeof fetch !== 'function') {
    return undefined;
  }

  // In browser environments, calling a detached window.fetch can throw
  // "Illegal invocation". Binding keeps the original receiver.
  return fetch.bind(globalThis) as RuntimeFetch;
}
