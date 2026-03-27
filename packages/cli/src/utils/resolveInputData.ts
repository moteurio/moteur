import fs from 'fs';
import path from 'path';

export interface ResolveInputDataOptions {
    file?: string;
    data?: string;
    /** If true, read JSON from stdin when neither file nor data provided (and when !process.stdin.isTTY). */
    stdin?: boolean;
    allowEmpty?: boolean;
}

function shouldReadStdin(args: ResolveInputDataOptions): boolean {
    if (args.file || args.data) return false;
    return !!(args.stdin && !process.stdin.isTTY);
}

/**
 * Resolve JSON body from --file=path, --data='...', or stdin.
 * Returns empty object if no source and allowEmpty; otherwise throws with a friendly message.
 */
export async function resolveInputData(
    args: ResolveInputDataOptions & { allowEmpty?: boolean }
): Promise<Record<string, unknown>> {
    if (args.file) {
        const filePath = path.resolve(args.file);
        if (!fs.existsSync(filePath)) {
            throw new Error(
                `File not found: ${args.file}. Example: moteur projects create --file=project.json`
            );
        }
        const raw = fs.readFileSync(filePath, 'utf-8');
        try {
            return JSON.parse(raw) as Record<string, unknown>;
        } catch (e) {
            throw new Error(
                `Invalid JSON in ${args.file}. ${e instanceof Error ? e.message : String(e)}`
            );
        }
    }
    if (args.data) {
        try {
            return JSON.parse(args.data) as Record<string, unknown>;
        } catch (e) {
            throw new Error(`Invalid --data JSON. ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    if (shouldReadStdin(args)) {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
        const raw = Buffer.concat(chunks).toString('utf-8').trim();
        if (!raw) return args.allowEmpty ? {} : Promise.reject(new Error('No JSON on stdin.'));
        try {
            return JSON.parse(raw) as Record<string, unknown>;
        } catch (e) {
            throw new Error(
                `Invalid JSON from stdin. ${e instanceof Error ? e.message : String(e)}`
            );
        }
    }
    if (args.allowEmpty) return {};
    throw new Error(
        "Provide --file=path, --data='{...}', or pipe JSON from stdin. Example: moteur projects create --file=project.json"
    );
}

/**
 * Convenience: get JSON body from args (--file, --data, or stdin when piping). Returns null when no input and interactive (so caller can wizard or use inline).
 */
export async function getBodyFromArgs(
    args: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
    const hasInput = args.file || args.data || (!process.stdin.isTTY && args.stdin !== false);
    if (!hasInput) return null;
    try {
        return await resolveInputData({
            file: args.file as string,
            data: args.data as string,
            stdin: true,
            allowEmpty: true
        });
    } catch {
        return null;
    }
}

/**
 * Sync version for file/data only (no stdin). Use when you need sync and don't support stdin.
 */
export function resolveInputDataSync(args: {
    file?: string;
    data?: string;
    allowEmpty?: boolean;
}): Record<string, unknown> {
    if (args.file) {
        const filePath = path.resolve(args.file);
        if (!fs.existsSync(filePath)) {
            throw new Error(
                `File not found: ${args.file}. Example: moteur projects create --file=project.json`
            );
        }
        const raw = fs.readFileSync(filePath, 'utf-8');
        try {
            return JSON.parse(raw) as Record<string, unknown>;
        } catch (e) {
            throw new Error(
                `Invalid JSON in ${args.file}. ${e instanceof Error ? e.message : String(e)}`
            );
        }
    }
    if (args.data) {
        try {
            return JSON.parse(args.data) as Record<string, unknown>;
        } catch (e) {
            throw new Error(`Invalid --data JSON. ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    if (args.allowEmpty) return {};
    throw new Error(
        "Provide --file=path or --data='{...}'. Example: moteur projects create --file=project.json"
    );
}
