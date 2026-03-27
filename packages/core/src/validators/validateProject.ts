import { ProjectSchema } from '@moteurio/types/Project.js';
import { ValidationResult } from '@moteurio/types/ValidationResult.js';
import { createValidationResult, addIssue } from '../utils/validation.js';

/** Reserved project ids (internal/reserved words). Comparison is case-insensitive. Sorted alphabetically. */
const RESERVED_PROJECT_IDS = new Set(
    [
        'activity',
        'activities',
        'admin',
        'ai',
        'api',
        'app',
        'asset',
        'assets',
        'audit',
        'audits',
        'auth',
        'block',
        'blocks',
        'blueprint',
        'blueprints',
        'cli',
        'collection',
        'collections',
        'comment',
        'comments',
        'config',
        'configuration',
        'content',
        'contents',
        'core',
        'css',
        'data',
        'demo',
        'dist',
        'doc',
        'docs',
        'entry',
        'entries',
        'etc',
        'field',
        'fields',
        'file',
        'files',
        'form',
        'forms',
        'iphone',
        'javascript',
        'key',
        'keys',
        'layout',
        'layouts',
        'locale',
        'locales',
        'mac',
        'media',
        'menu',
        'menus',
        'model',
        'models',
        'moteur',
        'moteur-admin',
        'navigation',
        'navigations',
        'node',
        'node_modules',
        'nodejs',
        'page',
        'pages',
        'permission',
        'permissions',
        'presence',
        'project',
        'projects',
        'public',
        'registry',
        'registries',
        'role',
        'roles',
        'service',
        'services',
        'setting',
        'settings',
        'src',
        'structure',
        'structures',
        'studio',
        'submission',
        'submissions',
        'system',
        'template',
        'templates',
        'trash',
        'type',
        'types',
        'user',
        'users',
        'util',
        'utils',
        'validator',
        'validators',
        'webhook',
        'webhooks',
        'win'
    ].map(s => s.toLowerCase())
);

/** Project id prefixes that are reserved (e.g. moteur-*, node-*, plugin-*, plugins-*). */
const RESERVED_PROJECT_ID_PREFIXES = ['moteur-', 'node-', 'plugin-', 'plugins-'];

function isReservedProjectId(id: string): boolean {
    const lower = id.trim().toLowerCase();
    if (RESERVED_PROJECT_IDS.has(lower)) return true;
    return RESERVED_PROJECT_ID_PREFIXES.some(prefix => lower.startsWith(prefix));
}

export interface ValidateProjectOptions {
    /** When updating an existing project, pass its id so reserved IDs (e.g. demo, moteur-*) are allowed. */
    existingProjectId?: string;
}

export function validateProject(
    project: ProjectSchema,
    options?: ValidateProjectOptions
): ValidationResult {
    const result = createValidationResult();

    // id: required on create; optional on update (when existingProjectId is set). When present, validate format and reserved.
    const isUpdate = options?.existingProjectId !== undefined;
    if (!project.id || typeof project.id !== 'string') {
        if (!isUpdate) {
            addIssue(result, {
                type: 'error',
                code: 'PROJECT_INVALID_ID',
                message: 'Project "id" must be a non-empty string.',
                path: 'id'
            });
        }
    } else {
        const id = project.id.trim();
        if (id.startsWith('.')) {
            addIssue(result, {
                type: 'error',
                code: 'PROJECT_INVALID_ID',
                message: 'Project "id" cannot start with a dot.',
                path: 'id'
            });
        } else if (!/^[a-z]/.test(id)) {
            addIssue(result, {
                type: 'error',
                code: 'PROJECT_INVALID_ID',
                message: 'Project "id" must start with a letter (a-z).',
                path: 'id'
            });
        } else if (id !== id.toLowerCase()) {
            addIssue(result, {
                type: 'error',
                code: 'PROJECT_INVALID_ID',
                message: 'Project "id" must be all lowercase.',
                path: 'id'
            });
        } else if (
            !(
                options?.existingProjectId !== undefined && id === options.existingProjectId.trim()
            ) &&
            isReservedProjectId(id)
        ) {
            addIssue(result, {
                type: 'error',
                code: 'PROJECT_RESERVED_ID',
                message:
                    'Project "id" cannot be a reserved name (e.g. moteur, admin, api, or names starting with moteur-, node-, plugin-, or plugins-).',
                path: 'id'
            });
        }
    }

    // label: required, string
    if (!project.label || typeof project.label !== 'string') {
        addIssue(result, {
            type: 'error',
            code: 'PROJECT_INVALID_LABEL',
            message: 'Project "label" must be a non-empty string.',
            path: 'label'
        });
    }

    // description: optional, string
    if (project.description !== undefined && typeof project.description !== 'string') {
        addIssue(result, {
            type: 'error',
            code: 'PROJECT_INVALID_DESCRIPTION',
            message: 'Project "description" must be a string if provided.',
            path: 'description'
        });
    }

    // defaultLocale: required, string
    if (!project.defaultLocale || typeof project.defaultLocale !== 'string') {
        addIssue(result, {
            type: 'error',
            code: 'PROJECT_INVALID_DEFAULT_LOCALE',
            message: 'Project "defaultLocale" must be a non-empty string.',
            path: 'defaultLocale'
        });
    }

    // supportedLocales: optional, must be array of strings if present
    if (project.supportedLocales !== undefined) {
        if (!Array.isArray(project.supportedLocales)) {
            addIssue(result, {
                type: 'error',
                code: 'PROJECT_INVALID_SUPPORTED_LOCALES',
                message: 'Project "supportedLocales" must be an array of strings if provided.',
                path: 'supportedLocales'
            });
        } else {
            project.supportedLocales.forEach((locale, index) => {
                if (typeof locale !== 'string') {
                    addIssue(result, {
                        type: 'error',
                        code: 'PROJECT_INVALID_LOCALE',
                        message: 'Each supported locale must be a string.',
                        path: `supportedLocales[${index}]`
                    });
                }
            });
        }
    }

    // users: optional, array of strings
    if (project.users !== undefined) {
        if (!Array.isArray(project.users)) {
            addIssue(result, {
                type: 'error',
                code: 'PROJECT_INVALID_USERS',
                message: 'Project "users" must be an array of strings if provided.',
                path: 'users'
            });
        } else {
            project.users.forEach((user, index) => {
                if (typeof user !== 'string') {
                    addIssue(result, {
                        type: 'error',
                        code: 'PROJECT_INVALID_USER',
                        message: 'Each user in "users" must be a string.',
                        path: `users[${index}]`
                    });
                }
            });
        }
    }

    // assetConfig.enabled: optional boolean
    if (
        project.assetConfig?.enabled !== undefined &&
        typeof project.assetConfig.enabled !== 'boolean'
    ) {
        addIssue(result, {
            type: 'error',
            code: 'PROJECT_INVALID_ASSET_CONFIG',
            message: 'Project "assetConfig.enabled" must be a boolean if provided.',
            path: 'assetConfig.enabled'
        });
    }

    // git.enabled, git.remoteUrl: optional
    if (project.git !== undefined) {
        if (typeof project.git !== 'object' || project.git === null) {
            addIssue(result, {
                type: 'error',
                code: 'PROJECT_INVALID_GIT',
                message: 'Project "git" must be an object if provided.',
                path: 'git'
            });
        } else {
            if (project.git.enabled !== undefined && typeof project.git.enabled !== 'boolean') {
                addIssue(result, {
                    type: 'error',
                    code: 'PROJECT_INVALID_GIT',
                    message: 'Project "git.enabled" must be a boolean if provided.',
                    path: 'git.enabled'
                });
            }
            if (
                project.git.remoteUrl !== undefined &&
                (typeof project.git.remoteUrl !== 'string' || !project.git.remoteUrl.trim())
            ) {
                addIssue(result, {
                    type: 'error',
                    code: 'PROJECT_INVALID_GIT',
                    message: 'Project "git.remoteUrl" must be a non-empty string if provided.',
                    path: 'git.remoteUrl'
                });
            }
        }
    }

    // ai.enabled: optional boolean
    if (project.ai?.enabled !== undefined && typeof project.ai.enabled !== 'boolean') {
        addIssue(result, {
            type: 'error',
            code: 'PROJECT_INVALID_AI',
            message: 'Project "ai.enabled" must be a boolean if provided.',
            path: 'ai.enabled'
        });
    }

    // presence.enabled: optional boolean
    if (project.presence?.enabled !== undefined && typeof project.presence.enabled !== 'boolean') {
        addIssue(result, {
            type: 'error',
            code: 'PROJECT_INVALID_PRESENCE',
            message: 'Project "presence.enabled" must be a boolean if provided.',
            path: 'presence.enabled'
        });
    }

    return result;
}
