/**
 * Parse CLI rest args (after command/subcommand) into a record.
 * --key=value → { key: 'value' }, --flag → { flag: true }.
 */
export function parseArgs(rest: string[]): Record<string, unknown> {
    return Object.fromEntries(
        rest.map(arg => {
            const s = arg.replace(/^--/, '');
            const eq = s.indexOf('=');
            if (eq >= 0) return [s.slice(0, eq), s.slice(eq + 1)];
            return [s, true];
        })
    );
}
