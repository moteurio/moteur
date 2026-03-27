import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptSecret, decryptSecret } from '../../src/webhooks/secretEncryption.js';

describe('secretEncryption', () => {
    const validHexKey = 'a'.repeat(64); // 32 bytes hex

    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('encryptSecret / decryptSecret', () => {
        it('roundtrips when MOTEUR_ENCRYPTION_KEY is set (hex)', async () => {
            process.env.MOTEUR_ENCRYPTION_KEY = validHexKey;
            const secret = 'my-webhook-secret-123';
            const encrypted = encryptSecret(secret);
            expect(encrypted).not.toBe(secret);
            expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/); // base64
            const decrypted = decryptSecret(encrypted);
            expect(decrypted).toBe(secret);
        });

        it('roundtrips when key is a passphrase (derived via sha256)', () => {
            process.env.MOTEUR_ENCRYPTION_KEY = 'my-passphrase';
            const secret = 'webhook-secret';
            const encrypted = encryptSecret(secret);
            expect(encrypted).not.toBe(secret);
            const decrypted = decryptSecret(encrypted);
            expect(decrypted).toBe(secret);
        });

        it('produces different ciphertext each time (random IV)', () => {
            process.env.MOTEUR_ENCRYPTION_KEY = validHexKey;
            const secret = 'same-secret';
            const e1 = encryptSecret(secret);
            const e2 = encryptSecret(secret);
            expect(e1).not.toBe(e2);
            expect(decryptSecret(e1)).toBe(secret);
            expect(decryptSecret(e2)).toBe(secret);
        });
    });

    describe('when MOTEUR_ENCRYPTION_KEY is not set', () => {
        it('encryptSecret returns plaintext', () => {
            delete process.env.MOTEUR_ENCRYPTION_KEY;
            const secret = 'plain-secret';
            const result = encryptSecret(secret);
            expect(result).toBe(secret);
        });

        it('decryptSecret returns value as-is', () => {
            delete process.env.MOTEUR_ENCRYPTION_KEY;
            const value = 'anything';
            expect(decryptSecret(value)).toBe(value);
        });
    });

    describe('decryptSecret edge cases', () => {
        it('returns as-is for non-encrypted (short) string', () => {
            process.env.MOTEUR_ENCRYPTION_KEY = validHexKey;
            const short = 'short';
            expect(decryptSecret(short)).toBe(short);
        });

        it('returns as-is for invalid base64 that is too short after decode', () => {
            process.env.MOTEUR_ENCRYPTION_KEY = validHexKey;
            const invalid = Buffer.alloc(20).toString('base64'); // no IV+tag+ciphertext
            expect(decryptSecret(invalid)).toBe(invalid);
        });

        it('returns as-is when decryption fails (tampered ciphertext)', () => {
            process.env.MOTEUR_ENCRYPTION_KEY = validHexKey;
            const encrypted = encryptSecret('secret');
            const tampered = encrypted.slice(0, -2) + 'XX';
            expect(decryptSecret(tampered)).toBe(tampered);
        });
    });
});
