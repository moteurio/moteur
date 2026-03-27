import path from 'path';
import process from 'node:process';
import fs from 'fs';

/**
 * Root for resolving relative storage paths.
 * Override with DATA_ROOT for explicit root.
 * If DATA_ROOT is not set:
 * - If data/users.json exists in cwd, use cwd.
 * - If cwd is inside packages/<name> (e.g. packages/core), use repo root so data lives at repo/data not packages/core/data.
 * - If cwd/moteur/data exists (running from workspace root), use cwd/moteur.
 * - Otherwise use cwd.
 */
function getDataRoot(): string {
    const explicit = process.env.DATA_ROOT;
    if (explicit) return path.resolve(explicit);
    const cwd = process.cwd();
    const dataUsersInCwd = path.join(cwd, 'data', 'users.json');
    if (fs.existsSync(dataUsersInCwd)) return cwd;
    const moteurData = path.join(cwd, 'moteur', 'data', 'users.json');
    if (fs.existsSync(moteurData)) return path.join(cwd, 'moteur');
    // When running from packages/core (e.g. tests), put data at repo root (moteur/data), not packages/core/data
    const dirName = path.basename(cwd);
    const parentName = path.basename(path.dirname(cwd));
    if (parentName === 'packages' && dirName === 'core') {
        return path.resolve(cwd, '..', '..');
    }
    return cwd;
}

/** Resolve a path relative to the data root. */
function resolveFromRoot(relativePath: string): string {
    const normalized = path.normalize(relativePath);
    if (path.isAbsolute(normalized)) {
        return normalized;
    }
    return path.join(getDataRoot(), normalized);
}

/**
 * Centralized storage-related configuration.
 * Single source of truth for PROJECTS_DIR and AUTH_USERS_FILE.
 * All paths are resolved and validated at read time.
 *
 * Concurrency: file-based storage has no cross-process locking. For multi-instance
 * deployments (e.g. several API workers), avoid concurrent writes to the same file
 * or consider a database backend. users.json uses atomic writes (temp + rename).
 */
export const storageConfig = {
    /**
     * Directory containing all project folders.
     * Env: PROJECTS_DIR. Default: data/projects (relative to data root).
     */
    get projectsDir(): string {
        const raw = process.env.PROJECTS_DIR || 'data/projects';
        return resolveFromRoot(raw);
    },

    /**
     * Directory containing blueprint JSON files (one file per blueprint).
     * Env: BLUEPRINTS_DIR. Default: data/blueprints (relative to data root).
     */
    get blueprintsDir(): string {
        const raw = process.env.BLUEPRINTS_DIR || 'data/blueprints';
        return resolveFromRoot(raw);
    },

    /**
     * Path to the users JSON file (auth).
     * Env: AUTH_USERS_FILE. Default: data/users.json (relative to data root).
     */
    get usersFile(): string {
        const raw = process.env.AUTH_USERS_FILE || 'data/users.json';
        return resolveFromRoot(raw);
    },

    /** Data root used for resolving relative paths. */
    get dataRoot(): string {
        return getDataRoot();
    }
};

/**
 * Validates that storage paths exist or are creatable.
 * Call at startup to fail fast on misconfiguration.
 * @throws Error if validation fails
 */
export function validateStorageConfig(): void {
    const root = storageConfig.dataRoot;
    const projectsDir = storageConfig.projectsDir;
    const usersFile = storageConfig.usersFile;
    const usersDir = path.dirname(usersFile);

    if (!fs.existsSync(root)) {
        throw new Error(`[Moteur] DATA_ROOT does not exist: ${root}`);
    }
    if (!fs.existsSync(projectsDir)) {
        try {
            fs.mkdirSync(projectsDir, { recursive: true });
        } catch (_e) {
            throw new Error(`[Moteur] PROJECTS_DIR cannot be created: ${projectsDir}`);
        }
    }
    const blueprintsDir = storageConfig.blueprintsDir;
    if (!fs.existsSync(blueprintsDir)) {
        try {
            fs.mkdirSync(blueprintsDir, { recursive: true });
        } catch (_e) {
            throw new Error(`[Moteur] BLUEPRINTS_DIR cannot be created: ${blueprintsDir}`);
        }
    }
    if (!fs.existsSync(usersDir)) {
        try {
            fs.mkdirSync(usersDir, { recursive: true });
        } catch (_e) {
            throw new Error(`[Moteur] AUTH_USERS_FILE directory cannot be created: ${usersDir}`);
        }
    }
    if (!fs.existsSync(usersFile)) {
        try {
            fs.writeFileSync(usersFile, '[]', 'utf-8');
        } catch (_e) {
            throw new Error(`[Moteur] AUTH_USERS_FILE cannot be created: ${usersFile}`);
        }
    }
}
