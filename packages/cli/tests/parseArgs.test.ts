import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/utils/parseArgs.js';

describe('parseArgs', () => {
    it('parses --key=value', () => {
        expect(parseArgs(['--project=my-blog'])).toEqual({ project: 'my-blog' });
        expect(parseArgs(['--id=abc'])).toEqual({ id: 'abc' });
    });

    it('parses --flag as true', () => {
        expect(parseArgs(['--json'])).toEqual({ json: true });
        expect(parseArgs(['--plain'])).toEqual({ plain: true });
    });

    it('parses multiple args', () => {
        expect(parseArgs(['--project=my-blog', '--json', '--id=xyz'])).toEqual({
            project: 'my-blog',
            json: true,
            id: 'xyz'
        });
    });

    it('returns empty object for empty rest', () => {
        expect(parseArgs([])).toEqual({});
    });

    it('handles --no-color style (strip -- once)', () => {
        expect(parseArgs(['--no-color'])).toEqual({ 'no-color': true });
    });
});
