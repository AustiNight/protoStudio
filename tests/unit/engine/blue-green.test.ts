import { describe, expect, it, vi } from 'vitest';

import { SwapManager } from '../../../src/engine/preview/blue-green';
import {
  getConsoleInterceptorScript,
  listenForErrors,
  sendToIframe,
  type BridgeMessage,
} from '../../../src/engine/preview/iframe-bridge';

class MockIframe {
  public srcdoc = '';
  public style = {
    opacity: '',
    zIndex: '',
    pointerEvents: '',
  };
  public contentWindow: { postMessage: (message: unknown, targetOrigin: string) => void } | null = null;

  private listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)?.add(listener);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string): void {
    this.listeners.get(type)?.forEach((listener) => listener());
  }
}

function createManager(activeSlot: 'blue' | 'green' = 'blue') {
  const blue = new MockIframe();
  const green = new MockIframe();
  const manager = new SwapManager({
    blueFrame: blue as unknown as HTMLIFrameElement,
    greenFrame: green as unknown as HTMLIFrameElement,
    activeSlot,
  });

  return { manager, blue, green };
}

describe('SwapManager', () => {
  it('should track active slot correctly after swap', () => {
    const { manager } = createManager();

    manager.swap();

    expect(manager.getActiveSlot()).toBe('green');
  });

  it('should alternate slots on consecutive swaps', () => {
    const { manager } = createManager();

    manager.swap();
    manager.swap();

    expect(manager.getActiveSlot()).toBe('blue');
  });

  it('should inject srcdoc to the inactive iframe', () => {
    const { manager, green } = createManager();

    manager.injectToInactive('<html>hi</html>');

    expect(green.srcdoc).toBe('<html>hi</html>');
  });

  it('should resolve waitForLoad when load event fires', async () => {
    const { manager, green } = createManager();

    const promise = manager.waitForLoad(500);
    green.emit('load');

    await expect(promise).resolves.toBe(true);
  });

  it('should reject waitForLoad on timeout', async () => {
    vi.useFakeTimers();
    const { manager } = createManager();

    const promise = manager.waitForLoad(200);
    vi.advanceTimersByTime(200);

    await expect(promise).rejects.toThrow('Preview iframe load timed out.');
    vi.useRealTimers();
  });
});

describe('iframe bridge', () => {
  it('should send postMessage to iframe', () => {
    const postMessage = vi.fn();
    const iframe = {
      contentWindow: { postMessage },
    } as unknown as HTMLIFrameElement;

    const message: BridgeMessage = { source: 'protoStudio', type: 'log', payload: 'hello' };
    sendToIframe(iframe, message);

    expect(postMessage).toHaveBeenCalledWith(message, '*');
  });

  it('should route error messages to callback', () => {
    const listeners = new Set<(event: MessageEvent) => void>();
    const globalTarget = globalThis as unknown as {
      addEventListener?: (type: 'message', listener: (event: MessageEvent) => void) => void;
      removeEventListener?: (type: 'message', listener: (event: MessageEvent) => void) => void;
    };

    const originalAdd = globalTarget.addEventListener;
    const originalRemove = globalTarget.removeEventListener;

    globalTarget.addEventListener = (_type, listener) => {
      listeners.add(listener);
    };
    globalTarget.removeEventListener = (_type, listener) => {
      listeners.delete(listener);
    };

    const callback = vi.fn();
    const unsubscribe = listenForErrors(callback);

    const event = {
      data: { source: 'protoStudio', type: 'error', payload: 'Boom' },
    } as MessageEvent;
    listeners.forEach((listener) => listener(event));

    expect(callback).toHaveBeenCalledWith('Boom');

    unsubscribe();

    const eventAfter = {
      data: { source: 'protoStudio', type: 'error', payload: 'Nope' },
    } as MessageEvent;
    listeners.forEach((listener) => listener(eventAfter));

    expect(callback).toHaveBeenCalledTimes(1);

    if (originalAdd) {
      globalTarget.addEventListener = originalAdd;
    } else {
      delete globalTarget.addEventListener;
    }
    if (originalRemove) {
      globalTarget.removeEventListener = originalRemove;
    } else {
      delete globalTarget.removeEventListener;
    }
  });

  it('should generate console interceptor script', () => {
    const script = getConsoleInterceptorScript();

    expect(script).toContain('console.error');
    expect(script).toContain('postMessage');
    expect(script).toContain('protoStudio');
  });
});
