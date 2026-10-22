import { printTable } from '../utils/printTable.js';
import { pathOf, type CommandSpec } from '@moteurio/commands';

/** What a command shows: JSON with --json, else its table, its sentence, or the result as JSON. */
export function printResult(
    command: CommandSpec,
    result: unknown,
    args: Record<string, unknown>
): void {
    if (args.quiet) return;
    if (args.json) {
        if (result !== undefined && result !== '') console.log(JSON.stringify(result, null, 2));
        return;
    }
    if (command.done) {
        console.log(command.done(result, args));
        return;
    }
    // --json gets the whole response (totals, facets); the table shows the list in it.
    if (command.pick && result && typeof result === 'object' && !Array.isArray(result)) {
        result = (result as Record<string, unknown>)[command.pick] ?? result;
    }
    if (command.table && isRecordMap(result)) {
        result = Object.entries(result as Record<string, Record<string, unknown>>).map(
            ([key, value]) => ({ type: key, id: key, ...value })
        );
    }
    if (command.table && Array.isArray(result)) {
        if (!result.length) {
            console.log('Nothing here.');
            return;
        }
        const rows = (result as Record<string, unknown>[]).map(row =>
            Object.fromEntries(
                command.table!.map(c => [
                    c.key,
                    c.format ? c.format(pathOf(row, c.key), row) : pathOf(row, c.key)
                ])
            )
        );
        printTable(command.table, rows);
        return;
    }
    if (typeof result === 'string') {
        console.log(result);
        return;
    }
    if (result === undefined || result === null || result === '') {
        console.log('Done.');
        return;
    }
    console.log(JSON.stringify(result, null, 2));
}

/** `{ "core/paragraph": { … }, … }`: a map of records, shown as rows. */
function isRecordMap(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const values = Object.values(value);
    return values.length > 0 && values.every(v => v && typeof v === 'object' && !Array.isArray(v));
}
