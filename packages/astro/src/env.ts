type NodeProcess = {
    env?: Record<string, string | undefined>;
    getBuiltinModule?: (id: string) => unknown;
};

/**
 * Reads a variable from the environment, or from the site's `.env` files in the order Vite reads
 * them (`.env.[mode].local`, `.env.[mode]`, `.env.local`, `.env`). The fallback is needed because
 * Astro does not copy those files into `process.env` while it loads content. This function does not modify `process.env`.
 */
export function env(name: string): string | undefined {
    const proc = (globalThis as { process?: NodeProcess }).process;
    const set = proc?.env?.[name];
    if (set) return set;
    const fs = proc?.getBuiltinModule?.('node:fs') as
        { readFileSync(file: string, encoding: 'utf8'): string } | undefined;
    const util = proc?.getBuiltinModule?.('node:util') as
        { parseEnv?(content: string): Record<string, string> } | undefined;
    if (!fs || !util?.parseEnv) return undefined;
    const mode = proc?.env?.NODE_ENV === 'production' ? 'production' : 'development';
    for (const file of [`.env.${mode}.local`, `.env.${mode}`, '.env.local', '.env']) {
        try {
            const value = util.parseEnv(fs.readFileSync(file, 'utf8'))[name];
            if (value) return value;
        } catch {
            // The file does not exist or cannot be read, so try the next one.
        }
    }
    return undefined;
}
