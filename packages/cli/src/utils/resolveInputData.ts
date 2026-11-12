import fs from 'fs';
import path from 'path';

export interface ResolveInputDataOptions {
    file?: string;
    data?: string;
    /** Reads JSON from stdin when neither a file nor inline data is given and stdin is not a terminal. */
    stdin?: boolean;
    allowEmpty?: boolean;
}

function shouldReadStdin(args: ResolveInputDataOptions): boolean {
    if (args.file || args.data) return false;
    return !!(args.stdin && !process.stdin.isTTY);
}

/**
 * Resolves the JSON body from --file=path, --data='...' or stdin. When there is no source it
 * returns an empty object if `allowEmpty` is set, and otherwise throws an error with a readable message.
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
                `Invalid JSON in ${args.file}. ${e instanceof Error ? e.message : String(e)}`,
                { cause: e }
            );
        }
    }
    if (args.data) {
        try {
            return JSON.parse(args.data) as Record<string, unknown>;
        } catch (e) {
            throw new Error(`Invalid --data JSON. ${e instanceof Error ? e.message : String(e)}`, {
                cause: e
            });
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
                `Invalid JSON from stdin. ${e instanceof Error ? e.message : String(e)}`,
                { cause: e }
            );
        }
    }
    if (args.allowEmpty) return {};
    throw new Error(
        "Provide --file=path, --data='{...}', or pipe JSON from stdin. Example: moteur projects create --file=project.json"
    );
}

/**
 * Gets the JSON body from the arguments (--file, --data, or stdin when input is piped). Returns
 * null when there is no input and the session is interactive, so the caller can prompt for values
 * or use inline arguments instead.
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
 * Synchronous variant that reads only --file and --data, never stdin. Use it where an async call is
 * not possible.
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
                `Invalid JSON in ${args.file}. ${e instanceof Error ? e.message : String(e)}`,
                { cause: e }
            );
        }
    }
    if (args.data) {
        try {
            return JSON.parse(args.data) as Record<string, unknown>;
        } catch (e) {
            throw new Error(`Invalid --data JSON. ${e instanceof Error ? e.message : String(e)}`, {
                cause: e
            });
        }
    }
    if (args.allowEmpty) return {};
    throw new Error(
        "Provide --file=path or --data='{...}'. Example: moteur projects create --file=project.json"
    );
}
