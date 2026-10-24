/** Durable OAuth grants, alongside the API's other file-backed data. Codes and tokens are hashed. */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { McpAccessPolicy } from './access.js';

export interface PendingAuthorization {
    clientId: string;
    redirectUri: string;
    challenge: string;
    state?: string;
    resource: string;
    scopes: string[];
    expires: number;
}

export interface Grant {
    clientId: string;
    userId: string;
    agentName: string;
    resource: string;
    scopes: string[];
    expires: number;
    revoked?: boolean;
    /** Missing on credentials from before project consent: they must reconnect. */
    policy?: McpAccessPolicy;
}

export interface OAuthData {
    version: 1;
    clients: Record<string, { client: OAuthClientInformationFull; expires: number }>;
    pending: Record<string, PendingAuthorization>;
    codes: Record<
        string,
        PendingAuthorization & { userId: string; agentName: string; policy?: McpAccessPolicy }
    >;
    grants: Record<string, Grant>;
    access: Record<string, { grantId: string; expires: number }>;
    refresh: Record<string, { grantId: string; expires: number; used?: boolean }>;
}

/** Synchronous transactions within one API process, persisted by atomic replacement.
 * Like Moteur's other file-backed data, run one writer process on a durable disk.
 */
export class OAuthStore {
    constructor(private readonly directory: string) {}

    read(): OAuthData {
        try {
            const data = JSON.parse(
                fs.readFileSync(path.join(this.directory, 'oauth.json'), 'utf8')
            ) as OAuthData;
            if (data.version !== 1) throw new Error('Unsupported MCP OAuth store version');
            return data;
        } catch (error) {
            if ((error as { code?: string }).code !== 'ENOENT') throw error;
            return {
                version: 1,
                clients: {},
                pending: {},
                codes: {},
                grants: {},
                access: {},
                refresh: {}
            };
        }
    }

    async update<T>(change: (data: OAuthData) => T): Promise<T> {
        fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
        const temporary = path.join(
            this.directory,
            `.oauth-${randomBytes(12).toString('hex')}.tmp`
        );
        try {
            const data = this.read();
            const now = Date.now();
            for (const records of [
                data.clients,
                data.pending,
                data.codes,
                data.grants,
                data.access,
                data.refresh
            ]) {
                for (const [key, value] of Object.entries(records)) {
                    if (value.expires <= now) delete records[key];
                }
            }
            const result = change(data);
            fs.writeFileSync(temporary, JSON.stringify(data), { mode: 0o600 });
            fs.renameSync(temporary, path.join(this.directory, 'oauth.json'));
            return result;
        } finally {
            fs.rmSync(temporary, { force: true });
        }
    }
}
