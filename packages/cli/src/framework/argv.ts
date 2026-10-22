/**
 * The words after `moteur`: positionals, `--key value`, `--key=value`, `--no-key`, and the
 * short flags -y (yes), -h (help), -q (quiet).
 */
export interface ParsedArgv {
    words: string[];
    flags: Record<string, string | boolean | string[]>;
}

const SHORT: Record<string, string> = { y: 'yes', h: 'help', q: 'quiet', p: 'project' };

/** Flags that never take a value, so `--json list` doesn't read `list` as its value. */
export const BOOLEAN_FLAGS = new Set([
    'json',
    'quiet',
    'yes',
    'help',
    'plain',
    'no-color',
    'debug',
    'force',
    'version'
]);

export function parseArgv(argv: string[], booleans: Set<string> = BOOLEAN_FLAGS): ParsedArgv {
    const words: string[] = [];
    const flags: ParsedArgv['flags'] = {};
    const set = (key: string, value: string | boolean) => {
        const prev = flags[key];
        // Repeated flags collect: --filter a --filter b.
        if (prev !== undefined && typeof prev !== 'boolean' && typeof value === 'string') {
            flags[key] = Array.isArray(prev) ? [...prev, value] : [prev, value];
        } else flags[key] = value;
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--') {
            words.push(...argv.slice(i + 1));
            break;
        }
        const long = /^--([^=]+)(?:=(.*))?$/s.exec(a);
        if (long) {
            const [, key, value] = long;
            if (value !== undefined) set(key, value);
            else if (key.startsWith('no-') && !booleans.has(key)) set(key.slice(3), false);
            else if (!booleans.has(key) && i + 1 < argv.length && !argv[i + 1].startsWith('-'))
                set(key, argv[++i]);
            else set(key, true);
            continue;
        }
        const short = /^-([a-z])$/i.exec(a);
        if (short && SHORT[short[1]]) {
            const key = SHORT[short[1]];
            if (!booleans.has(key) && i + 1 < argv.length && !argv[i + 1].startsWith('-'))
                set(key, argv[++i]);
            else set(key, true);
            continue;
        }
        words.push(a);
    }
    return { words, flags };
}

/** `readingTime` and `reading_time` are read as `reading-time`. */
export const kebab = (s: string): string =>
    s
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/_/g, '-')
        .toLowerCase();
