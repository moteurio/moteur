import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { showHelp, showCommandHelp } from '../src/commands/help.js';

describe('help', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    describe('showHelp', () => {
        it('prints Usage line with command and subcommand', () => {
            showHelp();
            const output = logSpy.mock.calls.map(c => c[0]).join('\n');
            expect(output).toContain('Usage: moteur <command> [subcommand] [--flags]');
        });

        it('prints Commands section', () => {
            showHelp();
            const output = logSpy.mock.calls.map(c => c[0]).join('\n');
            expect(output).toContain('Commands:');
        });

        it('prints Examples section with at least one global example', () => {
            showHelp();
            const output = logSpy.mock.calls.map(c => c[0]).join('\n');
            expect(output).toContain('Examples:');
            expect(output).toContain('moteur auth login');
        });

        it('prints help hint for per-command examples', () => {
            showHelp();
            const output = logSpy.mock.calls.map(c => c[0]).join('\n');
            expect(output).toContain('moteur help <command>');
        });
    });

    describe('showCommandHelp', () => {
        it('prints command-specific usage for known command', () => {
            showCommandHelp('projects');
            const output = logSpy.mock.calls.map(c => c[0]).join('\n');
            expect(output).toContain('moteur projects');
            expect(output).toContain('subcommand');
        });

        it('prints examples for command that has COMMAND_EXAMPLES', () => {
            showCommandHelp('projects');
            const output = logSpy.mock.calls.map(c => c[0]).join('\n');
            expect(output).toContain('moteur projects list');
        });

        it('logs to stderr and calls showHelp for unknown command', () => {
            showCommandHelp('unknown-command-xyz');
            expect(errorSpy).toHaveBeenCalledWith('Unknown command:', 'unknown-command-xyz');
            const logOutput = logSpy.mock.calls.map(c => c[0]).join('\n');
            expect(logOutput).toContain('Usage: moteur');
        });
    });
});
