export const SETTINGS_STORAGE_KEY = 'studio.settings.v1';

export function readEncryptedSettings(): string | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  try {
    return storage.getItem(SETTINGS_STORAGE_KEY);
  } catch (error) {
    return null;
  }
}

export function writeEncryptedSettings(ciphertext: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, ciphertext);
  } catch (error) {
    return;
  }
}

export function clearEncryptedSettings(): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(SETTINGS_STORAGE_KEY);
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
