import fs from 'fs';
import { readTextCachedSync } from './fileCache.js';
import { writeFileAtomicSync } from './fileUtils.js';
import path from 'path';

/**
 * A project's secrets file, `.moteur/secrets.json`. It is gitignored, excluded from snapshots, and
 * readable only by the user the server runs as. Each feature keeps its own section (`git`,
 * `project`, and so on), and the caller encrypts the values in it.
 */
const SECRETS_FILE = path.join('.moteur', 'secrets.json');

export type SecretsFile = Record<string, unknown>;

export function secretsFilePath(projectDir: string): string {
    return path.join(projectDir, SECRETS_FILE);
}

export function readSecretsFile(projectDir: string): SecretsFile {
    try {
        const parsed = JSON.parse(readTextCachedSync(secretsFilePath(projectDir)));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

export function writeSecretsFile(projectDir: string, secrets: SecretsFile): void {
    const file = secretsFilePath(projectDir);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeFileAtomicSync(file, JSON.stringify(secrets, null, 2), 0o600);
}

/** Changes one section and leaves the others as they are. An `undefined` value removes the section. */
export function updateSecretsSection(projectDir: string, section: string, value: unknown): void {
    const secrets = readSecretsFile(projectDir);
    if (value === undefined) delete secrets[section];
    else secrets[section] = value;
    writeSecretsFile(projectDir, secrets);
}
