import chalk from 'chalk';
import Table from 'cli-table3';

/**
 * Prints an array of objects as a table. List commands use it when neither --json nor --quiet is
 * set. It renders with cli-table3 and chalk.
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
    // Skip colour codes when NO_COLOR or --plain is set, or when the output is not a terminal.
    const table = new Table({
        head: headerRow,
        ...(chalk.level === 0 ? { style: { head: [], border: [] } } : {})
    });
    table.push(...dataRows);
    console.log(table.toString());
}
