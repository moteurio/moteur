/**
 * A passkey (a WebAuthn credential) as it is kept on the account, in `users.json`. The public key
 * is no secret, but none of this leaves the server as it is: the account page gets a
 * `PasskeySummary`.
 */
export interface StoredPasskey {
    /** The credential's id, base64url. */
    id: string;
    /** Its COSE public key, base64url. */
    publicKey: string;
    /** The authenticator's signature counter (0 for most synced passkeys). */
    counter: number;
    /** How the browser can reach it: `internal`, `hybrid`, `usb`, `nfc`, `ble`… */
    transports?: string[];
    /** `multiDevice`: synced (iCloud Keychain, Google Password Manager…); `singleDevice`: kept on one key or device. */
    deviceType: 'singleDevice' | 'multiDevice';
    /** Whether it is backed up (synced) now. */
    backedUp: boolean;
    /** The authenticator model's id, when it said. */
    aaguid?: string;
    /** What the person calls it. */
    name: string;
    createdAt: string;
    lastUsedAt?: string;
    /** The browser and system it was made on, from the user agent ("Safari on macOS"). */
    createdOn?: string;
}

/** A passkey as the account page lists it. */
export interface PasskeySummary {
    id: string;
    name: string;
    createdAt: string;
    lastUsedAt?: string;
    /** Synced across the person's devices (`multiDevice` and backed up). */
    synced: boolean;
    deviceType: 'singleDevice' | 'multiDevice';
    /** Where it lives, when the authenticator is a known one ("iCloud Keychain", "1Password"…). */
    provider?: string;
    /** The browser and system it was made on ("Chrome on Windows"). */
    createdOn?: string;
    transports?: string[];
}

/**
 * What the browser needs to make a passkey: `navigator.credentials.create()`'s options, as JSON
 * (binary values in base64url). Pass it to `PublicKeyCredential.parseCreationOptionsFromJSON()` or
 * a library such as `@simplewebauthn/browser`.
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

/** What the browser needs to sign in with a passkey: `navigator.credentials.get()`'s options, as JSON. */
export interface PasskeyRequestOptionsJSON {
    challenge: string;
    timeout?: number;
    rpId?: string;
    allowCredentials?: { id: string; type: 'public-key'; transports?: string[] }[];
    userVerification?: string;
    hints?: string[];
    extensions?: Record<string, unknown>;
}

/** The browser's answer to `create()`, as JSON (`PublicKeyCredential.toJSON()`). */
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

/** The browser's answer to `get()`, as JSON (`PublicKeyCredential.toJSON()`). */
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
