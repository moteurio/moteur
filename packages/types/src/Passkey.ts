/**
 * A passkey (a WebAuthn credential) as stored on the user account in `users.json`. The public key
 * is not secret, but this record is never sent to clients as it is. Account endpoints return a
 * `PasskeySummary` instead.
 */
export interface StoredPasskey {
    /** Credential ID, base64url-encoded. */
    id: string;
    /** The credential's COSE public key, base64url-encoded. */
    publicKey: string;
    /** The authenticator's signature counter. It is 0 for most synced passkeys. */
    counter: number;
    /** Transports the browser can use to reach the authenticator, such as `internal`, `hybrid`, `usb`, `nfc` or `ble`. */
    transports?: string[];
    /** `multiDevice` for a passkey that is synced between devices (for example iCloud Keychain or Google Password Manager). `singleDevice` for one stored on a single security key or device. */
    deviceType: 'singleDevice' | 'multiDevice';
    /** Whether the passkey is currently backed up (synced). */
    backedUp: boolean;
    /** AAGUID identifying the authenticator model. Set only when the authenticator reports it. */
    aaguid?: string;
    /** Name the user gave the passkey. */
    name: string;
    createdAt: string;
    lastUsedAt?: string;
    /** Browser and operating system the passkey was created on, derived from the user agent (for example "Safari on macOS"). */
    createdOn?: string;
}

/** A passkey as returned in account listings. */
export interface PasskeySummary {
    id: string;
    name: string;
    createdAt: string;
    lastUsedAt?: string;
    /** True when the passkey is synced across the user's devices (`multiDevice` and backed up). */
    synced: boolean;
    deviceType: 'singleDevice' | 'multiDevice';
    /** The service that holds the passkey, when the authenticator is a known one (for example "iCloud Keychain" or "1Password"). */
    provider?: string;
    /** Browser and operating system the passkey was created on (for example "Chrome on Windows"). */
    createdOn?: string;
    transports?: string[];
}

/**
 * The options for creating a passkey, in the form of `navigator.credentials.create()` options
 * serialized as JSON (binary values are base64url-encoded). Pass them to
 * `PublicKeyCredential.parseCreationOptionsFromJSON()` or to a library such as
 * `@simplewebauthn/browser`.
 */
export interface PasskeyCreationOptionsJSON {
    rp: { id?: string; name: string };
    user: { id: string; name: string; displayName: string };
    challenge: string;
    pubKeyCredParams: { type: 'public-key'; alg: number }[];
    timeout?: number;
    excludeCredentials?: { id: string; type: 'public-key'; transports?: string[] }[];
    authenticatorSelection?: {
        authenticatorAttachment?: string;
        requireResidentKey?: boolean;
        residentKey?: string;
        userVerification?: string;
    };
    hints?: string[];
    attestation?: string;
    extensions?: Record<string, unknown>;
}

/** The options for signing in with a passkey, in the form of `navigator.credentials.get()` options serialized as JSON. */
export interface PasskeyRequestOptionsJSON {
    challenge: string;
    timeout?: number;
    rpId?: string;
    allowCredentials?: { id: string; type: 'public-key'; transports?: string[] }[];
    userVerification?: string;
    hints?: string[];
    extensions?: Record<string, unknown>;
}

/** The browser's response to `create()`, serialized as JSON with `PublicKeyCredential.toJSON()`. */
export interface PasskeyRegistrationJSON {
    id: string;
    rawId: string;
    type: 'public-key';
    response: {
        clientDataJSON: string;
        attestationObject: string;
        authenticatorData?: string;
        transports?: string[];
        publicKeyAlgorithm?: number;
        publicKey?: string;
    };
    authenticatorAttachment?: string;
    clientExtensionResults: Record<string, unknown>;
}

/** The browser's response to `get()`, serialized as JSON with `PublicKeyCredential.toJSON()`. */
export interface PasskeyAuthenticationJSON {
    id: string;
    rawId: string;
    type: 'public-key';
    response: {
        clientDataJSON: string;
        authenticatorData: string;
        signature: string;
        userHandle?: string;
    };
    authenticatorAttachment?: string;
    clientExtensionResults: Record<string, unknown>;
}
