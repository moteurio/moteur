import { describe, expect, it } from 'vitest';
import { commandCliId, commandMcpId, commandSurfaces } from '../src/PluginCommand.js';

describe('plugin command ids', () => {
    it('names CLI and MCP the same way the catalog does', () => {
        const spec = { group: 'play', name: 'qr', summary: 'QR' };
        expect(commandCliId(spec)).toBe('play qr');
        expect(commandMcpId(spec)).toBe('play_qr');
        expect(commandSurfaces(spec)).toEqual(['cli', 'mcp']);
        expect(commandSurfaces({ ...spec, surfaces: ['mcp'] })).toEqual(['mcp']);
    });
});
