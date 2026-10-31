import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import type {
    PasskeyAuthenticationJSON,
    PasskeyCreationOptionsJSON,
    PasskeyRegistrationJSON,
    PasskeyRequestOptionsJSON
} from '@moteurio/types/Passkey.js';

/**
 * A software authenticator for tests: what a browser and a phone (or a security key) send back to
 * `navigator.credentials.create()` and `.get()`. ES256 keys, "none" attestation, a minimal CBOR
 * writer. Test code only: the engine checks these with @simplewebauthn/server.
 */

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const fromB64url = (value: string) => new Uint8Array(Buffer.from(value, 'base64url'));
const sha256 = (data: Uint8Array | string) =>
    new Uint8Array(createHash('sha256').update(data).digest());

function head(major: number, n: number): number[] {
    if (n < 24) return [(major << 5) | n];
    if (n < 0x100) return [(major << 5) | 24, n];
    if (n < 0x10000) return [(major << 5) | 25, n >> 8, n & 0xff];
    return [(major << 5) | 26, (n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

type Cbor = number | string | Uint8Array | Map<Cbor, Cbor> | { [key: string]: Cbor };

function cbor(value: Cbor): number[] {
    if (value instanceof Uint8Array) return [...head(2, value.length), ...value];
    if (typeof value === 'string') {
        const bytes = Buffer.from(value, 'utf8');
        return [...head(3, bytes.length), ...bytes];
    }
    if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value);
    const entries = value instanceof Map ? [...value.entries()] : Object.entries(value);
    return [...head(5, entries.length), ...entries.flatMap(([k, v]) => [...cbor(k), ...cbor(v)])];
}

const concat = (...parts: (Uint8Array | number[])[]) =>
    new Uint8Array(parts.flatMap(part => [...part]));

const u32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

type Credential = {
    id: Uint8Array;
    privateKey: KeyObject;
    cose: Uint8Array;
    rpId: string;
    userHandle: string;
    counter: number;
};

export type AuthenticatorOptions = {
    /** The page the browser says it is on (default `http://localhost:5180`). */
    origin?: string;
    /** Synced (iCloud Keychain-like): backup flags set, counter stays 0. Default true. */
    synced?: boolean;
    /** The authenticator model's id (default: iCloud Keychain's). */
    aaguid?: string;
};

export class SoftAuthenticator {
    readonly credentials: Credential[] = [];
    origin: string;
    readonly synced: boolean;
    readonly aaguid: string;
    /** Whether the person unlocked the device (face, finger, PIN). */
    verifiesUser = true;

    constructor(options: AuthenticatorOptions = {}) {
        this.origin = options.origin ?? 'http://localhost:5180';
        this.synced = options.synced ?? true;
        this.aaguid = options.aaguid ?? 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd';
    }

    private flags(extra: number): number {
        return 0x01 | (this.verifiesUser ? 0x04 : 0) | (this.synced ? 0x18 : 0) | extra;
    }

    private clientData(type: string, challenge: string): Uint8Array {
        return new Uint8Array(
            Buffer.from(
                JSON.stringify({ type, challenge, origin: this.origin, crossOrigin: false }),
                'utf8'
            )
        );
    }

    /** `navigator.credentials.create()` */
    create(options: PasskeyCreationOptionsJSON): PasskeyRegistrationJSON {
        const rpId = options.rp.id ?? new URL(this.origin).hostname;
        const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
        const jwk = publicKey.export({ format: 'jwk' });
        const cose = new Uint8Array(
            cbor(
                new Map<Cbor, Cbor>([
                    [1, 2],
                    [3, -7],
                    [-1, 1],
                    [-2, fromB64url(jwk.x!)],
                    [-3, fromB64url(jwk.y!)]
                ])
            )
        );
        const id = new Uint8Array(randomBytes(32));
        const credential: Credential = {
            id,
            privateKey,
            cose,
            rpId,
            userHandle: options.user.id,
            counter: 0
        };
        const aaguid = Buffer.from(this.aaguid.replace(/-/g, ''), 'hex');
        const authData = concat(
            sha256(rpId),
            [this.flags(0x40)],
            u32(0),
            aaguid,
            [id.length >> 8, id.length & 0xff],
            id,
            cose
        );
        this.credentials.push(credential);
        return {
            id: b64url(id),
            rawId: b64url(id),
            type: 'public-key',
            response: {
                clientDataJSON: b64url(this.clientData('webauthn.create', options.challenge)),
                attestationObject: b64url(
                    new Uint8Array(cbor({ fmt: 'none', attStmt: {}, authData }))
                ),
                transports: ['internal', 'hybrid']
            },
            authenticatorAttachment: 'platform',
            clientExtensionResults: {}
        };
    }

    /** `navigator.credentials.get()`: with the credential named, or the first that fits. */
    get(options: PasskeyRequestOptionsJSON, credentialId?: string): PasskeyAuthenticationJSON {
        const allowed = options.allowCredentials?.map(c => c.id);
        const credential = this.credentials.find(
            c =>
                (!options.rpId || c.rpId === options.rpId) &&
                (!credentialId || b64url(c.id) === credentialId) &&
                (!allowed?.length || allowed.includes(b64url(c.id)))
        );
        if (!credential) throw new Error('NotAllowedError: no passkey for this request');
        if (!this.synced) credential.counter += 1;
        const authData = concat(sha256(credential.rpId), [this.flags(0)], u32(credential.counter));
        const clientDataJSON = this.clientData('webauthn.get', options.challenge);
        const signature = sign(
            'sha256',
            concat(authData, sha256(clientDataJSON)),
            credential.privateKey
        );
        return {
            id: b64url(credential.id),
            rawId: b64url(credential.id),
            type: 'public-key',
            response: {
                clientDataJSON: b64url(clientDataJSON),
                authenticatorData: b64url(authData),
                signature: b64url(new Uint8Array(signature)),
                userHandle: credential.userHandle
            },
            authenticatorAttachment: 'platform',
            clientExtensionResults: {}
        };
    }
}
