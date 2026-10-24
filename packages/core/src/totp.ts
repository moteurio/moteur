/**
 * Authenticator app codes (TOTP, RFC 6238): HMAC-SHA1, 30-second steps, 6 digits, the way
 * Google Authenticator, 1Password, Authy and the like read an `otpauth://` link.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(bytes: Buffer): string {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
    return out;
}

export function base32Decode(text: string): Buffer {
    const clean = text.toUpperCase().replace(/[\s=-]/g, '');
    let bits = 0;
    let value = 0;
    const out: number[] = [];
    for (const ch of clean) {
        const i = ALPHABET.indexOf(ch);
        if (i < 0) throw new Error('Not a base32 secret');
        value = (value << 5) | i;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(out);
}

/** A new secret for an authenticator app: 160 random bits, in base32. */
export function newTotpSecret(): string {
    return base32Encode(randomBytes(20));
}

/** The 30-second step a time falls in. */
export const totpStep = (now = Date.now()): number => Math.floor(now / 1000 / STEP_SECONDS);

/** The code for a step. */
export function totpCode(secret: string, step: number): string {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
    const offset = hmac[hmac.length - 1] & 15;
    const n = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
    return String(n).padStart(DIGITS, '0');
}

/**
 * The step a code was made for, when it is right for now (one step either side, for clocks
 * that drift) and newer than `after` (a code is used once); null otherwise.
 */
export function verifyTotp(
    secret: string,
    code: string,
    options: { now?: number; after?: number } = {}
): number | null {
    const given = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(given)) return null;
    const now = totpStep(options.now);
    for (const step of [now - 1, now, now + 1]) {
        if (options.after !== undefined && step <= options.after) continue;
        const expected = totpCode(secret, step);
        if (timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return step;
    }
    return null;
}

/** The link an authenticator app reads (as a QR code): `otpauth://totp/Moteur:you@x?…`. */
export function otpauthUri(account: string, secret: string, issuer = 'Moteur'): string {
    const label = encodeURIComponent(`${issuer}:${account}`);
    const query = new URLSearchParams({
        secret,
        issuer,
        algorithm: 'SHA1',
        digits: String(DIGITS),
        period: String(STEP_SECONDS)
    });
    return `otpauth://totp/${label}?${query}`;
}
