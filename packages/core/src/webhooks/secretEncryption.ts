import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey(): Buffer | null {
    const raw = process.env.MOTEUR_ENCRYPTION_KEY;
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    // Support 64-char hex key (32 bytes)
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
        return Buffer.from(trimmed, 'hex');
    }
    // Otherwise derive 32 bytes from the string
    return crypto.createHash('sha256').update(trimmed, 'utf8').digest();
}

/**
 * Encrypt a webhook secret for storage. Uses AES-256-GCM with MOTEUR_ENCRYPTION_KEY.
 * If MOTEUR_ENCRYPTION_KEY is not set, returns the secret as-is (development only) and logs a warning.
 */
export function encryptSecret(secret: string): string {
    const key = getEncryptionKey();
    if (!key || key.length < KEY_LENGTH) {
        if (!process.env.MOTEUR_ENCRYPTION_KEY) {
            console.warn(
                '[moteur] MOTEUR_ENCRYPTION_KEY is not set; webhook secrets are stored in plaintext (development only).'
            );
        }
        return secret;
    }
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key.subarray(0, KEY_LENGTH), iv);
    const enc = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, enc]).toString('base64');
}

/**
 * Decrypt a webhook secret. If value is not in encrypted format, returns as-is.
 */
export function decryptSecret(encrypted: string): string {
    const key = getEncryptionKey();
    if (!key || key.length < KEY_LENGTH) {
        return encrypted;
    }
    try {
        const buf = Buffer.from(encrypted, 'base64');
        if (buf.length <= IV_LENGTH + AUTH_TAG_LENGTH) return encrypted;
        const iv = buf.subarray(0, IV_LENGTH);
        const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
        const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
        const decipher = crypto.createDecipheriv(ALGORITHM, key.subarray(0, KEY_LENGTH), iv);
        decipher.setAuthTag(authTag);
        return decipher.update(ciphertext) + decipher.final('utf8');
    } catch {
        return encrypted;
    }
}
