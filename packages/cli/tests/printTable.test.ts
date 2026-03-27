import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printTable } from '../src/utils/printTable.js';

describe('printTable', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        logSpy.mockRestore();
    });

    it('prints nothing when rows is empty', () => {
        printTable([{ key: 'id', header: 'id' }], []);
        expect(logSpy).not.toHaveBeenCalled();
    });

    it('prints header and one row', () => {
        printTable(
            [
                { key: 'id', header: 'id' },
                { key: 'label', header: 'label' }
            ],
            [{ id: 'p1', label: 'Project 1' }]
        );
        expect(logSpy).toHaveBeenCalledTimes(1);
        const output = logSpy.mock.calls[0][0] as string;
        expect(output).toContain('id');
        expect(output).toContain('label');
        expect(output).toContain('p1');
        expect(output).toContain('Project 1');
    });

    it('prints multiple rows', () => {
        printTable([{ key: 'id', header: 'id' }], [{ id: 'a' }, { id: 'b' }]);
        expect(logSpy).toHaveBeenCalledTimes(1);
        const output = logSpy.mock.calls[0][0] as string;
        expect(output).toContain('a');
        expect(output).toContain('b');
    });

    it('handles null/undefined with empty string', () => {
        printTable(
            [
                { key: 'id', header: 'id' },
                { key: 'opt', header: 'opt' }
            ],
            [{ id: 'x', opt: null }]
        );
        const output = logSpy.mock.calls[0][0] as string;
        expect(output).toContain('x');
    });
});
