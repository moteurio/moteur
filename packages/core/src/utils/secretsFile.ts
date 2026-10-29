import fs from 'fs';
import { readTextCachedSync } from './fileCache.js';
import { writeFileAtomicSync } from './fileUtils.js';
import path from 'path';

/**
 * A project's secrets file: `.moteur/secrets.json`, gitignored, never in a snapshot, readable by
 * the server's user only. Each feature keeps its own section (`git`, `project`…); values in it are
 * encrypted by the caller.
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

/** Change one section, leaving the others as they are. `undefined` removes it. */
export function updateSecretsSection(projectDir: string, section: string, value: unknown): void {
    const secrets = readSecretsFile(projectDir);
    if (value === undefined) delete secrets[section];
    else secrets[section] = value;
    writeSecretsFile(projectDir, secrets);
}
