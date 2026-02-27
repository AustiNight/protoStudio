export const TELEMETRY_SESSION_KEY = 'studio.telemetry.session';

export function readTelemetrySessionId(): string | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  try {
    return storage.getItem(TELEMETRY_SESSION_KEY);
  } catch (error) {
    return null;
  }
}

export function writeTelemetrySessionId(sessionId: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(TELEMETRY_SESSION_KEY, sessionId);
  } catch (error) {
    return;
  }
}

export function clearTelemetrySessionId(): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(TELEMETRY_SESSION_KEY);
  } catch (error) {
    return;
  }
}

function getStorage(): Storage | null {
  if (!('localStorage' in globalThis)) {
    return null;
  }
  const storage = globalThis.localStorage;
  if (!storage) {
    return null;
  }
  return storage;
}
