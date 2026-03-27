import chalk from 'chalk';
import Table from 'cli-table3';

/**
 * Print an array of objects as a table. Used for list commands when not --json and not --quiet.
 * Uses cli-table3 + chalk for simple, fire-and-forget output.
 */
export function printTable(
    columns: Array<{ key: string; header: string }>,
    rows: Record<string, unknown>[]
): void {
    if (!rows.length) return;
    const headerRow = columns.map(c => chalk.bold(c.header));
    const dataRows = rows.map(row =>
        columns.map(c => {
            const v = row[c.key];
            if (v == null) return '';
            if (typeof v === 'object') return JSON.stringify(v);
            return String(v);
        })
    );
    const table = new Table({ head: headerRow });
    table.push(...dataRows);
    console.log(table.toString());
}
