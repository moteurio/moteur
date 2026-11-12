import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OpenAPIV3 } from 'openapi-types';
import { emailCodesAvailable, signupOpen } from '@moteurio/core/emailSignIn.js';
import { passkeysAvailable } from '@moteurio/core/passkeys.js';
import { mailUnavailable } from '@moteurio/core/email/transport.js';
import { pluginRegistry } from '@moteurio/core/registry/PluginRegistry.js';
import { isGitHubEnabled, isGoogleEnabled } from '../utils/authProviders.js';
import { pluginEntries } from '../plugins/pluginCatalog.js';

/**
 * Describes how this server is configured, for its operators: its version, sign-in methods, AI, MCP,
 * email, and which of the environment variables the engine reads are set. It reports only whether
 * each variable is set, never its value, so no secret leaves the server.
 */

/** The environment variables the engine reads, grouped as in docs/Configuration.md. */
export const ENV_GROUPS: Record<string, readonly string[]> = {
    addresses: [
        'STUDIO_URL',
        'MOTEUR_API_URL',
        'API_BASE_PATH',
        'CORS_ORIGINS',
        'STATIC_ASSETS_BASE_URL',
        'TRUST_PROXY',
        'PORT',
        'NODE_ENV'
    ],
    security: [
        'JWT_SECRET',
        'JWT_EXPIRY',
        'OPERATOR_SECRET',
        'MOTEUR_ENCRYPTION_KEY',
        'HELMET_DISABLED',
        'HELMET_CSP_DISABLED',
        'MOTEUR_ALLOW_LOOPBACK_URLS'
    ],
    signIn: [
        'MOTEUR_SIGNUP',
        'MOTEUR_EMAIL_SIGNIN',
        'MOTEUR_EMAIL_CODES_PER_HOUR',
        'MOTEUR_EMAIL_CODES_TO_LOG',
        'AUTH_GITHUB_CLIENT_ID',
        'AUTH_GITHUB_CLIENT_SECRET',
        'AUTH_GITHUB_REDIRECT_URI',
        'AUTH_GOOGLE_CLIENT_ID',
        'AUTH_GOOGLE_CLIENT_SECRET',
        'AUTH_GOOGLE_REDIRECT_URI',
        'AUTH_REDIRECT_AFTER_LOGIN',
        'MOTEUR_PASSKEYS',
        'MOTEUR_PASSKEY_RP_ID',
        'MOTEUR_PASSKEY_ORIGINS',
        'MOTEUR_PASSKEY_RP_NAME',
        'MOTEUR_TERMS_URL',
        'MOTEUR_PRIVACY_URL',
        'DEMO_PROJECT_ID'
    ],
    email: [
        'SMTP_HOST',
        'SMTP_PORT',
        'SMTP_USER',
        'SMTP_PASS',
        'SMTP_FROM',
        'SMTP_RETURN_PATH',
        'MOTEUR_DKIM_DOMAIN',
        'MOTEUR_DKIM_SELECTOR',
        'MOTEUR_DKIM_PRIVATE_KEY',
        'MOTEUR_DKIM_PRIVATE_KEY_FILE',
        'MOTEUR_EMAIL_PROJECT_CREDIT'
    ],
    ai: ['MOTEUR_AI_PROVIDER', 'MOTEUR_AI_MONTHLY_CREDITS', 'MOTEUR_AI_CREDITS_DISABLED'],
    mcp: ['MOTEUR_MCP', 'MOTEUR_MCP_PUBLIC_URL', 'MOTEUR_MCP_BODY_LIMIT'],
    plugins: ['MOTEUR_HOST_PLUGINS', 'MOTEUR_ENABLED_PLUGINS'],
    storage: [
        'DATA_ROOT',
        'PROJECTS_DIR',
        'BLUEPRINTS_DIR',
        'AUTH_USERS_FILE',
        'AUTH_SESSIONS_FILE',
        'OPERATORS_FILE',
        'WORKSPACES_FILE',
        'MOTEUR_METERING_DIR',
        'MOTEUR_CONTENT_INDEX',
        'MOTEUR_CONTENT_INDEX_RECHECK_MS',
        'MOTEUR_GIT_PUSH_DELAY_MS',
        'MOTEUR_DELIVERY_CACHE_SECONDS',
        'MOTEUR_CACHE_MB',
        'MOTEUR_IMAGE_CACHE_MB',
        'MOTEUR_INDEX_IDLE_SECONDS',
        'MOTEUR_SHUTDOWN_SECONDS'
    ],
    limits: [
        'API_BODY_LIMIT',
        'API_UPLOAD_MAX_MB',
        'API_UPLOAD_CONCURRENCY',
        'API_RATE_LIMIT_STUDIO_MAX',
        'API_RATE_LIMIT_FORMS_MAX',
        'API_RATE_LIMIT_LOGIN_MAX',
        'API_RATE_LIMIT_VERIFICATION_MAX',
        'MOTEUR_PUBLIC_CONCURRENCY',
        'MOTEUR_PUBLIC_QUEUE',
        'MOTEUR_PUBLIC_QUEUE_SECONDS',
        'MOTEUR_IMAGE_CONCURRENCY',
        'MOTEUR_IMAGE_MAX_PIXELS',
        'API_READ_MAX_REFERENCES',
        'API_READ_MAX_BYTES'
    ],
    logs: ['API_REQUEST_LOG_FILE', 'API_REQUEST_LOG_DIR', 'ONLINE_PRESENCE_MAX_IDLE_MS']
};

const startedAt = new Date().toISOString();

/** Reads the engine's version from the API package next to this file, whether running from src or dist. */
function engineVersion(): string | null {
    try {
        const here = path.dirname(fileURLToPath(import.meta.url));
        const pkg = JSON.parse(
            fs.readFileSync(path.join(here, '..', '..', 'package.json'), 'utf8')
        );
        return typeof pkg.version === 'string' ? pkg.version : null;
    } catch {
        return null;
    }
}

const isSet = (name: string) => (process.env[name] ?? '').trim() !== '';
const off = (name: string) => (process.env[name] ?? '').trim().toLowerCase() === 'off';

/** Lists the running plugins in a category: the engine's own plugins and the host plugins that started. */
function runningIn(category: string): { id: string; label: string }[] {
    const own = Object.entries(pluginRegistry.all())
        .filter(([, m]) => m.categories?.includes(category as never))
        .map(([id, m]) => ({ id, label: m.label || id }));
    const host = pluginEntries()
        .filter(e => e.running && e.categories?.includes(category as never))
        .map(e => ({ id: e.id, label: e.label || e.id }));
    const seen = new Set<string>();
    return [...own, ...host].filter(p => !seen.has(p.id) && seen.add(p.id));
}

export function serverInfo() {
    const credits = (process.env.MOTEUR_AI_MONTHLY_CREDITS ?? '').trim();
    return {
        version: engineVersion(),
        node: process.version,
        startedAt,
        production: process.env.NODE_ENV === 'production',
        signIn: {
            signup: signupOpen() ? 'open' : 'invite',
            emailCodes: emailCodesAvailable(),
            passkeys: passkeysAvailable(),
            providers: { github: isGitHubEnabled(), google: isGoogleEnabled() }
        },
        ai: {
            /** MOTEUR_AI_PROVIDER: the provider used for text assistance, when one is configured. */
            provider: (process.env.MOTEUR_AI_PROVIDER ?? '').trim() || null,
            plugins: runningIn('ai'),
            monthlyCredits: credits || '1000',
            creditsOff: ['1', 'true'].includes(
                (process.env.MOTEUR_AI_CREDITS_DISABLED ?? '').trim().toLowerCase()
            )
        },
        mcp: { on: !off('MOTEUR_MCP'), publicUrl: isSet('MOTEUR_MCP_PUBLIC_URL') },
        email: { sends: !mailUnavailable(), dkim: isSet('MOTEUR_DKIM_DOMAIN') },
        presence: runningIn('presence').length > 0,
        billing: runningIn('billing').length > 0,
        env: Object.entries(ENV_GROUPS).map(([group, names]) => ({
            group,
            vars: names.map(name => ({ name, set: isSet(name) }))
        }))
    };
}

const bool: OpenAPIV3.SchemaObject = { type: 'boolean' };
const str: OpenAPIV3.SchemaObject = { type: 'string' };
const plugins: OpenAPIV3.SchemaObject = {
    type: 'array',
    items: { type: 'object', properties: { id: str, label: str } }
};

export const serverPaths: Record<string, OpenAPIV3.PathItemObject> = {
    '/operator/server': {
        get: {
            summary: 'What the server runs with',
            description:
                'Its version, how people sign in (sign-up, email codes, passkeys, GitHub and Google), AI (the provider and the AI plugins running), MCP, email, presence and billing, and which environment variables the engine reads are set, by group. Never their values.',
            tags: ['Operator'],
            responses: {
                '200': {
                    description: 'The server',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    version: { ...str, nullable: true },
                                    node: str,
                                    startedAt: { type: 'string', format: 'date-time' },
                                    production: bool,
                                    signIn: {
                                        type: 'object',
                                        properties: {
                                            signup: { type: 'string', enum: ['open', 'invite'] },
                                            emailCodes: bool,
                                            passkeys: bool,
                                            providers: {
                                                type: 'object',
                                                properties: { github: bool, google: bool }
                                            }
                                        }
                                    },
                                    ai: {
                                        type: 'object',
                                        properties: {
                                            provider: { ...str, nullable: true },
                                            plugins,
                                            monthlyCredits: str,
                                            creditsOff: bool
                                        }
                                    },
                                    mcp: {
                                        type: 'object',
                                        properties: { on: bool, publicUrl: bool }
                                    },
                                    email: {
                                        type: 'object',
                                        properties: { sends: bool, dkim: bool }
                                    },
                                    presence: bool,
                                    billing: bool,
                                    env: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                group: str,
                                                vars: {
                                                    type: 'array',
                                                    items: {
                                                        type: 'object',
                                                        properties: { name: str, set: bool }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                '401': { description: 'Not signed in' },
                '403': { description: 'Operator access required' }
            }
        }
    }
};
