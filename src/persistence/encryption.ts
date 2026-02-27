export type EncryptionErrorCode =
  | 'crypto_unavailable'
  | 'invalid_passphrase'
  | 'invalid_ciphertext'
  | 'decryption_failed';

export class EncryptionError extends Error {
  readonly code: EncryptionErrorCode;

  constructor(code: EncryptionErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_LENGTH_BITS = 256;
const PBKDF2_ITERATIONS = 100_000;
const MIN_PASSPHRASE_LENGTH = 12;
const MIN_PAYLOAD_BYTES = SALT_BYTES + IV_BYTES + 16;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function encrypt(
  plaintext: string,
  passphrase: string,
): Promise<string> {
  validatePassphrase(passphrase);
  const cryptoRef = getCrypto();

  const salt = cryptoRef.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = cryptoRef.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const payload = encoder.encode(plaintext);
  const encrypted = await cryptoRef.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    payload,
  );

  const encryptedBytes = new Uint8Array(encrypted);
  const packed = new Uint8Array(
    salt.length + iv.length + encryptedBytes.length,
  );
  packed.set(salt, 0);
  packed.set(iv, salt.length);
  packed.set(encryptedBytes, salt.length + iv.length);

  return encodeBase64(packed);
}

export async function decrypt(
  ciphertext: string,
  passphrase: string,
): Promise<string> {
  validatePassphrase(passphrase);
  const cryptoRef = getCrypto();
  const packed = decodeBase64(ciphertext);

  if (packed.length < MIN_PAYLOAD_BYTES) {
    throw new EncryptionError(
      'invalid_ciphertext',
      'Ciphertext payload is too short.',
    );
  }

  const salt = packed.slice(0, SALT_BYTES);
  const iv = packed.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
  const encryptedBytes = packed.slice(SALT_BYTES + IV_BYTES);
  const key = await deriveKey(passphrase, salt);

  try {
    const decrypted = await cryptoRef.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedBytes,
    );
    return decoder.decode(decrypted);
  } catch (error) {
    throw new EncryptionError(
      'decryption_failed',
      'Unable to decrypt payload with provided passphrase.',
    );
  }
}

function getCrypto(): Crypto {
  const cryptoRef = globalThis.crypto;
  if (!cryptoRef || !cryptoRef.subtle) {
    throw new EncryptionError(
      'crypto_unavailable',
      'Web Crypto API unavailable in this environment.',
    );
  }
  return cryptoRef;
}

function validatePassphrase(passphrase: string): void {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new EncryptionError(
      'invalid_passphrase',
      `Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`,
    );
  }
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const cryptoRef = getCrypto();
  const keyMaterial = await cryptoRef.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return cryptoRef.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

function encodeBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  try {
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(value, 'base64'));
    }

    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (error) {
    throw new EncryptionError(
      'invalid_ciphertext',
      'Ciphertext payload is not valid base64.',
    );
  }
}
