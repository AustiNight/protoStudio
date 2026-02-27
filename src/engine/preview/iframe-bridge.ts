export type BridgeMessage = {
  source: 'protoStudio';
  type: 'error' | 'ready' | 'log';
  payload?: string;
};

interface MessageTarget {
  addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
  removeEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
}

function resolveMessageTarget(): MessageTarget | null {
  const candidate = globalThis as unknown;
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const maybeTarget = candidate as Partial<MessageTarget>;
  if (typeof maybeTarget.addEventListener !== 'function') {
    return null;
  }
  if (typeof maybeTarget.removeEventListener !== 'function') {
    return null;
  }

  return maybeTarget as MessageTarget;
}

function isBridgeMessage(data: unknown): data is BridgeMessage {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const message = data as { source?: unknown; type?: unknown };
  return message.source === 'protoStudio' && typeof message.type === 'string';
}

export function sendToIframe(iframe: HTMLIFrameElement, message: BridgeMessage): void {
  const target = iframe.contentWindow;
  if (!target) return;
  target.postMessage(message, '*');
}

export function listenForErrors(callback: (error: string) => void): () => void {
  const target = resolveMessageTarget();
  if (!target) {
    return () => undefined;
  }

  const handler = (event: MessageEvent) => {
    if (!isBridgeMessage(event.data)) return;
    if (event.data.type !== 'error') return;
    const payload = event.data.payload;
    if (typeof payload === 'string' && payload.trim()) {
      callback(payload);
    }
  };

  target.addEventListener('message', handler);
  return () => {
    target.removeEventListener('message', handler);
  };
}

export function getConsoleInterceptorScript(): string {
  return `(() => {
  const toMessage = (args) => {
    try {
      return args.map((arg) => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.message;
        return JSON.stringify(arg);
      }).join(' ');
    } catch (error) {
      return 'Unknown error';
    }
  };

  const report = (message) => {
    try {
      window.parent.postMessage({
        source: 'protoStudio',
        type: 'error',
        payload: message,
      }, '*');
    } catch (error) {
      // Ignore postMessage failures.
    }
  };

  const originalError = console.error;
  console.error = (...args) => {
    originalError.apply(console, args);
    report(toMessage(args));
  };

  window.addEventListener('error', (event) => {
    if (event && event.message) {
      report(event.message);
    }
  });
})();`;
}
