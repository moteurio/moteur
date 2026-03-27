/**
 * Friendly messages and "suggest next command" strings for errors and success.
 */

import { MoteurApiError } from '@moteurio/client';

/** Format a thrown error for CLI output (message + optional hint). */
export function formatError(err: unknown): string {
    if (err instanceof MoteurApiError) {
        let msg = err.message?.trim();
        if (!msg || msg === 'MoteurApiError') {
            msg = err.status != null ? `Request failed (HTTP ${err.status})` : 'Request failed';
        }
        let out = `✗ Error: ${msg}`;
        if (err.status === 404) {
            out +=
                '\n  → Check MOTEUR_API_URL matches the API (include path if you use API_BASE_PATH, e.g. http://localhost:3000/api).';
        }
        if (
            err.status === 401 ||
            msg.includes('401') ||
            msg.toLowerCase().includes('unauthorized') ||
            msg.toLowerCase().includes('not authenticated') ||
            msg.toLowerCase().includes('token')
        ) {
            out +=
                '\n  → Run: moteur auth login (JWT is required for most write and AI routes; API key alone is often not enough).';
        }
        return out;
    }

    const e = err as Error & { status?: number; code?: string; hint?: string };
    const msg = e?.message?.trim() || String(err);
    let out = `✗ Error: ${msg}`;
    if (e?.code && typeof e.code === 'string') out += `  [${e.code}]`;
    if (e?.hint) out += `\n  ${e.hint}`;
    if (
        msg.includes('401') ||
        msg.toLowerCase().includes('not authenticated') ||
        msg.toLowerCase().includes('token')
    ) {
        out += '\n  → Run: moteur auth login';
    }
    return out;
}

export function suggestNext(command: string, hint?: string): string {
    return hint ? `${hint} Run: moteur ${command}` : `Run: moteur ${command}`;
}

export function errProjectRequired(): string {
    return 'Project is required. Example: moteur projects get --id=my-blog. Or run: moteur help projects';
}

export function errIdRequired(command: string, idName = 'id'): string {
    return `${idName} is required. Example: moteur ${command}. Run: moteur help ${command.split(' ')[0]}`;
}

export function errNotLoggedIn(): string {
    return 'Not logged in or token expired. Run: moteur auth login';
}

export function errNotFound(resource: string, id: string, listCommand: string): string {
    return `"${id}" not found. List ${resource}: moteur ${listCommand}`;
}

export function successCreated(resource: string, id: string, viewCommand: string): string {
    return `Created ${resource} "${id}". View it: moteur ${viewCommand}`;
}

export function successDeleted(resource: string, id: string, listCommand: string): string {
    return `Deleted ${resource} "${id}". List ${resource}: moteur ${listCommand}`;
}
