import { describe, expect, it } from 'vitest';

import {
  decrypt,
  encrypt,
  EncryptionError,
} from '../../../src/persistence/encryption';

const passphrase = 'correct horse battery staple';

describe('encryption', () => {
  it('should encrypt and decrypt a roundtrip successfully', async () => {
    const plaintext = 'sk-test-123456';
    const ciphertext = await encrypt(plaintext, passphrase);
    const decrypted = await decrypt(ciphertext, passphrase);

    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertext for same plaintext', async () => {
    const plaintext = 'same-input';
    const ciphertextA = await encrypt(plaintext, passphrase);
    const ciphertextB = await encrypt(plaintext, passphrase);

    expect(ciphertextA).not.toBe(ciphertextB);
  });

  it('should fail decryption with wrong passphrase', async () => {
    const plaintext = 'super-secret';
    const ciphertext = await encrypt(plaintext, passphrase);

    await expect(decrypt(ciphertext, 'totally-wrong-passphrase')).rejects.toBeInstanceOf(
      EncryptionError,
    );
  });

  it('should handle empty string input', async () => {
    const plaintext = '';
    const ciphertext = await encrypt(plaintext, passphrase);
    const decrypted = await decrypt(ciphertext, passphrase);

    expect(decrypted).toBe('');
  });

  it('should handle very long input', async () => {
    const plaintext = 'a'.repeat(5000);
    const ciphertext = await encrypt(plaintext, passphrase);
    const decrypted = await decrypt(ciphertext, passphrase);

    expect(decrypted).toBe(plaintext);
  });

  it('should reject invalid passphrases', async () => {
    await expect(encrypt('payload', 'short')).rejects.toBeInstanceOf(
      EncryptionError,
    );
  });
});
