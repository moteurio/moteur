/**
 * Operators: the people who run the whole server (every project, every account, plugins, plans).
 * They are not users. They live in their own file (OPERATORS_FILE, not users.json), sign in on
 * their own route with a password and an authenticator app code, and get their own short-lived
 * token, signed with a key user tokens never use. Nothing a user or a project role holds makes
 * someone an operator.
 *
 * An operator starts on the server (`moteur-operators add`), which gives a one-time link: there
 * they choose a password, add Moteur to an authenticator app and keep their recovery codes.
 */
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import {
    createCipheriv,
    createDecipheriv,
    createHash,
    hkdfSync,
    randomBytes,
    randomUUID,
    timingSafeEqual
} from 'crypto';
import jwt, { type JwtPayload, type Secret } from 'jsonwebtoken';
import { storageConfig } from './config/storageConfig.js';
import { passwordProblem } from './auth.js';
import { newTotpSecret, otpauthUri, verifyTotp } from './totp.js';

/** What an operator is, as the API shows it (never secrets). */
export type Operator = {
    id: string;
    email: string;
    name: string;
    /** False until they finished their one-time link (password and authenticator). */
    enrolled: boolean;
    createdAt: string;
    createdBy?: string;
    lastLoginAt?: string;
    /** Recovery codes not used yet. */
    recoveryCodesLeft: number;
};

type StoredOperator = {
    id: string;
    email: string;
    name: string;
    passwordHash?: string;
    /** The authenticator secret, encrypted (see seal). */
    totp?: { secret: string; lastStep?: number };
    /** sha256 of each unused recovery code. */
    recoveryCodes?: string[];
    /** A one-time link to (re)start: sha256 of its token, and the secret offered on it. */
    enrollment?: { tokenHash: string; expiresAt: string; pendingSecret?: string };
    /** Raised whenever their sign-in changes: tokens from before stop working. */
    tokenVersion: number;
    createdAt: string;
    createdBy?: string;
    lastLoginAt?: string;
};

type OperatorsFile = { operators: StoredOperator[] };

/** An operator's session lasts an hour; then they sign in again, with a new code. */
export const OPERATOR_TOKEN_SECONDS = 60 * 60;
const ENROLL_HOURS = 24;
const RECOVERY_CODES = 10;
const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;
const AUDIENCE = 'moteur-operator';

/** Every wrong sign-in reads the same, whatever was wrong. */
export class OperatorAuthError extends Error {
    readonly status: number;
    constructor(message = 'Wrong email, password or code', status = 401) {
        super(message);
        this.name = 'OperatorAuthError';
        this.status = status;
    }
}

// ---- keys -------------------------------------------------------------------------------------

/**
 * Keys for operator tokens and authenticator secrets: from OPERATOR_SECRET when set (better: a
 * leaked JWT_SECRET then reaches no operator), else derived from JWT_SECRET. Never the key that
 * signs user tokens.
 */
function key(purpose: 'token' | 'totp'): Buffer {
    const base = process.env.OPERATOR_SECRET?.trim() || process.env.JWT_SECRET?.trim();
    if (!base) throw new Error('JWT_SECRET (or OPERATOR_SECRET) must be set for operators');
    return Buffer.from(hkdfSync('sha256', base, 'moteur', `moteur-operator-${purpose}`, 32));
}

function seal(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key('totp'), iv);
    const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return ['v1', iv, cipher.getAuthTag(), data]
        .map(p => (typeof p === 'string' ? p : p.toString('base64url')))
        .join('.');
}

function unseal(sealed: string): string {
    const [v, iv, tag, data] = sealed.split('.');
    if (v !== 'v1') throw new Error('Unknown authenticator secret format');
    const decipher = createDecipheriv('aes-256-gcm', key('totp'), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64url')),
        decipher.final()
    ]).toString('utf8');
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

function sameHash(a: string, b: string): boolean {
    const x = Buffer.from(a, 'hex');
    const y = Buffer.from(b, 'hex');
    return x.length === y.length && timingSafeEqual(x, y);
}

// ---- the file ---------------------------------------------------------------------------------

/** Read on every use: the server command writes it from another process. */
function read(): OperatorsFile {
    const file = storageConfig.operatorsFile;
    if (!fs.existsSync(file)) return { operators: [] };
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as OperatorsFile;
    return { operators: Array.isArray(data.operators) ? data.operators : [] };
}

function write(data: OperatorsFile): void {
    const file = storageConfig.operatorsFile;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    // Only the server's own user may read it.
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, file);
}

function change<T>(fn: (operators: StoredOperator[]) => T): T {
    const data = read();
    const out = fn(data.operators);
    write(data);
    return out;
}

const normEmail = (email: string) => email.trim().toLowerCase();

function view(o: StoredOperator): Operator {
    return {
        id: o.id,
        email: o.email,
        name: o.name,
        enrolled: Boolean(o.passwordHash && o.totp),
        createdAt: o.createdAt,
        ...(o.createdBy ? { createdBy: o.createdBy } : {}),
        ...(o.lastLoginAt ? { lastLoginAt: o.lastLoginAt } : {}),
        recoveryCodesLeft: o.recoveryCodes?.length ?? 0
    };
}

export function listOperators(): Operator[] {
    return read().operators.map(view);
}

export function getOperator(id: string): Operator | undefined {
    const o = read().operators.find(x => x.id === id);
    return o ? view(o) : undefined;
}

// ---- adding, resetting, removing --------------------------------------------------------------

/** A one-time link's token, stored only as its hash. */
function newEnrollment(): { token: string; enrollment: StoredOperator['enrollment'] } {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ENROLL_HOURS * 3600_000).toISOString();
    return { token, enrollment: { tokenHash: sha256(token), expiresAt } };
}

/**
 * Adds an operator (or gives one who never finished a new link) and returns the token of their
 * one-time link, valid 24 hours: `<studio>/operator/enroll/<token>`.
 */
export function addOperator(
    input: { email: string; name?: string },
    createdBy?: string
): { operator: Operator; token: string } {
    const email = normEmail(input.email);
    if (!/^[^\s@]+@[^\s@]+$/.test(email))
        throw new OperatorAuthError('A valid email is required', 400);
    const { token, enrollment } = newEnrollment();
    const operator = change(list => {
        const existing = list.find(o => o.email === email);
        if (existing?.passwordHash && existing.totp) {
            throw new OperatorAuthError(
                `${email} is already an operator (reset them instead)`,
                409
            );
        }
        if (existing) {
            existing.enrollment = enrollment;
            if (input.name) existing.name = input.name.trim();
            return existing;
        }
        const created: StoredOperator = {
            id: randomUUID(),
            email,
            name: input.name?.trim() || email.split('@')[0],
            enrollment,
            tokenVersion: 1,
            createdAt: new Date().toISOString(),
            ...(createdBy ? { createdBy } : {})
        };
        list.push(created);
        return created;
    });
    return { operator: view(operator), token };
}

/**
 * Starts an operator's sign-in again (lost phone, left the team…): their password, authenticator
 * and recovery codes are gone, every session ends, and they get a new one-time link.
 */
export function resetOperator(id: string): { operator: Operator; token: string } {
    const { token, enrollment } = newEnrollment();
    const operator = change(list => {
        const o = list.find(x => x.id === id);
        if (!o) throw new OperatorAuthError('No such operator', 404);
        delete o.passwordHash;
        delete o.totp;
        delete o.recoveryCodes;
        o.enrollment = enrollment;
        o.tokenVersion += 1;
        return o;
    });
    return { operator: view(operator), token };
}

/** Removes an operator; their sessions end at once. The last enrolled one can't be removed. */
export function removeOperator(id: string): void {
    change(list => {
        const i = list.findIndex(x => x.id === id);
        if (i < 0) throw new OperatorAuthError('No such operator', 404);
        const others = list.filter(o => o.id !== id && o.passwordHash && o.totp);
        if (!others.length && list[i].passwordHash) {
            throw new OperatorAuthError('The server needs at least one operator', 409);
        }
        list.splice(i, 1);
    });
}

// ---- the one-time link ------------------------------------------------------------------------

function byEnrollToken(list: StoredOperator[], token: string): StoredOperator {
    const hash = sha256(token);
    const o = list.find(x => x.enrollment && sameHash(x.enrollment.tokenHash, hash));
    if (!o || Date.parse(o.enrollment!.expiresAt) < Date.now()) {
        throw new OperatorAuthError(
            'This link has expired or was already used. Ask an operator for a new one.',
            410
        );
    }
    return o;
}

/**
 * What the one-time link shows: who it is for, and the authenticator secret to add (the same one
 * each time it is opened, until it is used).
 */
export function startEnrollment(token: string): {
    email: string;
    name: string;
    secret: string;
    otpauth: string;
} {
    return change(list => {
        const o = byEnrollToken(list, token);
        let secret: string;
        if (o.enrollment!.pendingSecret) secret = unseal(o.enrollment!.pendingSecret);
        else {
            secret = newTotpSecret();
            o.enrollment!.pendingSecret = seal(secret);
        }
        return { email: o.email, name: o.name, secret, otpauth: otpauthUri(o.email, secret) };
    });
}

/**
 * Finishes the link: a password, and a code from the authenticator proving it was added. Returns
 * the recovery codes (shown once) and a session.
 */
export async function completeEnrollment(
    token: string,
    input: { password: string; code: string }
): Promise<{ operator: Operator; recoveryCodes: string[]; token: string; expiresAt: string }> {
    const problem = passwordProblem(input.password ?? '');
    if (problem) throw new OperatorAuthError(problem, 400);
    if ((input.password ?? '').length < 12) {
        throw new OperatorAuthError('An operator password needs at least 12 characters', 400);
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    const recoveryCodes = Array.from({ length: RECOVERY_CODES }, () => {
        const raw = randomBytes(5).toString('hex');
        return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    });
    const o = change(list => {
        const op = byEnrollToken(list, token);
        const sealed = op.enrollment!.pendingSecret;
        if (!sealed)
            throw new OperatorAuthError('Open the link again to get the authenticator code', 409);
        const step = verifyTotp(unseal(sealed), input.code ?? '');
        if (step === null) {
            throw new OperatorAuthError(
                'That code is not right. Check the app shows Moteur, and try the newest code.',
                400
            );
        }
        op.passwordHash = passwordHash;
        op.totp = { secret: sealed, lastStep: step };
        op.recoveryCodes = recoveryCodes.map(sha256);
        op.tokenVersion += 1;
        op.lastLoginAt = new Date().toISOString();
        delete op.enrollment;
        return op;
    });
    return { operator: view(o), recoveryCodes, ...sign(o) };
}

// ---- signing in -------------------------------------------------------------------------------

const failures = new Map<string, { count: number; lockedUntil?: number }>();
let unknownHash: string | undefined;

/** Clears the lockout record (tests). */
export function resetOperatorLockouts(): void {
    failures.clear();
}

function sign(o: StoredOperator): { token: string; expiresAt: string } {
    const token = jwt.sign({ kind: 'operator', ver: o.tokenVersion }, key('token') as Secret, {
        subject: o.id,
        audience: AUDIENCE,
        expiresIn: OPERATOR_TOKEN_SECONDS
    });
    return { token, expiresAt: new Date(Date.now() + OPERATOR_TOKEN_SECONDS * 1000).toISOString() };
}

/**
 * Signs an operator in with their password and either a code from their authenticator app or one
 * of their recovery codes (used once). Five wrong tries lock the email for 15 minutes.
 */
export async function loginOperator(input: {
    email: string;
    password: string;
    code: string;
}): Promise<{ operator: Operator; token: string; expiresAt: string; recoveryCodeUsed?: boolean }> {
    const email = normEmail(input.email ?? '');
    const record = failures.get(email);
    if (record?.lockedUntil && record.lockedUntil > Date.now()) {
        throw new OperatorAuthError(`Too many tries. Try again in ${LOCK_MINUTES} minutes.`, 429);
    }
    const fail = (): never => {
        const r = failures.get(email) ?? { count: 0 };
        r.count += 1;
        if (r.count >= LOCK_AFTER) {
            r.lockedUntil = Date.now() + LOCK_MINUTES * 60_000;
            r.count = 0;
            console.warn(
                `[operators] ${email} locked for ${LOCK_MINUTES} minutes after ${LOCK_AFTER} failed sign-ins`
            );
        }
        failures.set(email, r);
        throw new OperatorAuthError();
    };

    const stored = read().operators.find(o => o.email === email);
    // Compare a password even for an unknown email, so timing says nothing.
    const hash = stored?.passwordHash ?? (unknownHash ??= await bcrypt.hash(randomUUID(), 12));
    const passwordOk = await bcrypt.compare(input.password ?? '', hash);
    if (!stored || !stored.passwordHash || !stored.totp || !passwordOk) return fail();

    const code = (input.code ?? '').trim().toLowerCase();
    let recoveryCodeUsed = false;
    const signedIn = change(list => {
        const o = list.find(x => x.id === stored.id)!;
        // A changed OPERATOR_SECRET (or JWT_SECRET) leaves the authenticator unreadable: the
        // recovery codes still work, and a reset sets it up again.
        let secret: string | null = null;
        try {
            secret = unseal(o.totp!.secret);
        } catch {
            console.error(
                `[operators] ${email}'s authenticator can't be read (OPERATOR_SECRET or JWT_SECRET changed?): use a recovery code, or reset them with moteur-operators reset`
            );
        }
        const step = secret ? verifyTotp(secret, code, { after: o.totp!.lastStep }) : null;
        if (step !== null) o.totp!.lastStep = step;
        else {
            const i = (o.recoveryCodes ?? []).findIndex(h => sameHash(h, sha256(code)));
            if (i < 0) return null;
            o.recoveryCodes!.splice(i, 1);
            recoveryCodeUsed = true;
        }
        o.lastLoginAt = new Date().toISOString();
        return o;
    });
    if (!signedIn) return fail();
    failures.delete(email);
    if (recoveryCodeUsed) console.warn(`[operators] ${email} signed in with a recovery code`);
    return {
        operator: view(signedIn),
        ...sign(signedIn),
        ...(recoveryCodeUsed ? { recoveryCodeUsed } : {})
    };
}

/** The operator a token is for, when it is an operator token still valid; throws otherwise. */
export function verifyOperatorToken(token: string): Operator {
    let payload: JwtPayload;
    try {
        payload = jwt.verify(token, key('token') as Secret, { audience: AUDIENCE }) as JwtPayload;
    } catch {
        throw new OperatorAuthError('Operator sign-in required');
    }
    const o = read().operators.find(x => x.id === payload.sub);
    if (
        !o ||
        payload.kind !== 'operator' ||
        payload.ver !== o.tokenVersion ||
        !o.passwordHash ||
        !o.totp
    ) {
        throw new OperatorAuthError('Operator sign-in required');
    }
    return view(o);
}
