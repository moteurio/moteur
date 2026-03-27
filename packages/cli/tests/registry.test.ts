import { describe, it, expect, beforeEach } from 'vitest';
import { CommandRegistry } from '../src/registry.js';

describe('CommandRegistry', () => {
    let registry: CommandRegistry;

    beforeEach(() => {
        registry = new CommandRegistry();
    });

    it('registers subcommands and retrieves by name', () => {
        const action = async () => {};
        registry.register('projects', { name: 'list', description: 'List projects', action });
        registry.register('projects', { name: 'get', description: 'Get one', action });
        expect(registry.has('projects')).toBe(true);
        expect(registry.has('projects', 'list')).toBe(true);
        expect(registry.has('projects', 'get')).toBe(true);
        expect(registry.has('projects', 'create')).toBe(false);
        const listDef = registry.get('projects', 'list');
        expect(listDef.name).toBe('list');
        expect(listDef.description).toBe('List projects');
        expect(listDef.action).toBe(action);
    });

    it('supports default subcommand (empty name)', () => {
        const action = async () => {};
        registry.register('projects', { name: '', description: 'List projects', action });
        registry.register('projects', { name: 'list', description: 'List projects', action });
        expect(registry.get('projects', 'list').name).toBe('list');
        expect(registry.get('projects').name).toBe('');
    });

    it('listCommands returns unique command names', () => {
        registry.register('projects', {
            name: 'list',
            description: 'List',
            action: async () => {}
        });
        registry.register('entries', {
            name: 'list',
            description: 'List entries',
            action: async () => {}
        });
        const commands = registry.listCommands();
        expect(commands).toContain('projects');
        expect(commands).toContain('entries');
        expect(commands.length).toBe(2);
    });

    it('listSubcommands returns all subcommands for a command', () => {
        registry.register('projects', {
            name: 'list',
            description: 'List',
            action: async () => {}
        });
        registry.register('projects', { name: 'get', description: 'Get', action: async () => {} });
        const subs = registry.listSubcommands('projects');
        expect(subs.length).toBe(2);
        const names = subs.map(s => s.name).sort();
        expect(names).toEqual(['get', 'list']);
    });

    it('throws when getting unknown command', () => {
        expect(() => registry.get('unknown')).toThrow(/not found|default/);
    });
});
