import type { User } from '@moteurio/types/User.js';
import { hasRole } from '@moteurio/types';
import { encryptSecret, decryptSecret } from './webhooks/secretEncryption.js';
import { projectDir } from './utils/pathUtils.js';
import { isValidId } from './utils/idUtils.js';
import { readSecretsFile, writeSecretsFile } from './utils/secretsFile.js';

/**
 * A project's Git token: what lets the server push to a private repository. It lives in the
 * workspace's secrets file (gitignored, never in a snapshot), encrypted with MOTEUR_ENCRYPTION_KEY,
 * and reaches Git only through the environment of each push: never the address, never git config.
 */
type StoredToken = { token: string; username?: string; setAt: string; setBy?: string };
type Secrets = { git?: StoredToken } & Record<string, unknown>;

/** What anyone may know about the token: whether there is one, and since when. */
export type GitTokenInfo = { hasToken: boolean; username?: string; setAt?: string };

/** The user name sent with the token when none is given; GitHub and GitLab accept any. */
const DEFAULT_USERNAME = 'x-access-token';
const TOKEN = /^[\x21-\x7e]{8,500}$/;
const USERNAME = /^[\w.@-]{1,100}$/;

function refuse(message: string, statusCode = 400): Error {
    return Object.assign(new Error(message), { statusCode });
}

function readSecrets(dir: string): Secrets {
    return readSecretsFile(dir) as Secrets;
}

function writeSecrets(dir: string, secrets: Secrets): void {
    writeSecretsFile(dir, secrets);
}

function assertAdmin(user: User, projectId: string): void {
    if (!isValidId(projectId)) throw refuse(`Invalid projectId: "${projectId}"`);
    if (!hasRole(user, 'admin'))
        throw refuse('Only an admin can change how the project reaches its Git address.', 403);
}

export function gitTokenInfo(projectId: string): GitTokenInfo {
    const stored = readSecrets(projectDir(projectId)).git;
    return stored
        ? { hasToken: true, username: stored.username, setAt: stored.setAt }
        : { hasToken: false };
}

/** Keep a token for pushes. Refuses whitespace and line breaks, which could forge a header. */
export function setGitToken(
    projectId: string,
    user: User,
    input: { token?: unknown; username?: unknown }
): GitTokenInfo {
    assertAdmin(user, projectId);
    const token = typeof input?.token === 'string' ? input.token.trim() : '';
    if (!TOKEN.test(token))
        throw refuse('The token must be 8 to 500 characters, with no spaces or line breaks.');
    const username =
        typeof input?.username === 'string' && input.username.trim()
            ? input.username.trim()
            : undefined;
    if (username !== undefined && !USERNAME.test(username))
        throw refuse('The user name may hold letters, digits, ".", "_", "@" and "-" only.');
    // A token that can write to a client's repository is never kept in clear on a real server.
    if (process.env.NODE_ENV === 'production' && !process.env.MOTEUR_ENCRYPTION_KEY?.trim())
        throw refuse(
            'This server has no encryption key, so it can’t keep a token. Its operator needs to set MOTEUR_ENCRYPTION_KEY.',
            409
        );
    const dir = projectDir(projectId);
    const secrets = readSecrets(dir);
    secrets.git = {
        token: encryptSecret(token),
        ...(username && { username }),
        setAt: new Date().toISOString(),
        setBy: user.id
    };
    writeSecrets(dir, secrets);
    return gitTokenInfo(projectId);
}

export function removeGitToken(projectId: string, user: User): GitTokenInfo {
    assertAdmin(user, projectId);
    const dir = projectDir(projectId);
    const secrets = readSecrets(dir);
    if (secrets.git) {
        delete secrets.git;
        writeSecrets(dir, secrets);
    }
    return { hasToken: false };
}

/**
 * The environment that lets one git command use the project's token, or undefined without one.
 * Git reads `GIT_CONFIG_*` as configuration for that command only (git 2.31+): stored helpers are
 * switched off and the token goes as an Authorization header, out of every process listing.
 */
export function gitAuthEnv(dir: string): Record<string, string> | undefined {
    const stored = readSecrets(dir).git;
    if (!stored) return undefined;
    const token = decryptSecret(stored.token);
    if (!TOKEN.test(token)) return undefined;
    const basic = Buffer.from(`${stored.username ?? DEFAULT_USERNAME}:${token}`).toString('base64');
    return {
        GIT_TERMINAL_PROMPT: '0',
        GIT_CONFIG_COUNT: '2',
        GIT_CONFIG_KEY_0: 'credential.helper',
        GIT_CONFIG_VALUE_0: '',
        GIT_CONFIG_KEY_1: 'http.extraHeader',
        GIT_CONFIG_VALUE_1: `Authorization: Basic ${basic}`
    };
}
