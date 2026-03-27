import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConfirm = vi.fn();
const mockCancel = vi.fn();
vi.mock('@clack/prompts', () => ({
    confirm: (...args: unknown[]) => mockConfirm(...args),
    isCancel: (x: unknown) => x === Symbol.for('clack:cancel'),
    cancel: (msg?: string) => mockCancel(msg)
}));

import { confirmDestructive } from '../src/utils/confirmPrompt.js';

describe('confirmDestructive', () => {
    beforeEach(() => {
        mockConfirm.mockReset();
        mockCancel.mockClear();
    });

    it('returns true when args.yes is true without prompting', async () => {
        const result = await confirmDestructive('Delete project?', { yes: true });
        expect(result).toBe(true);
        expect(mockConfirm).not.toHaveBeenCalled();
    });

    it('returns true when args.force is true without prompting', async () => {
        const result = await confirmDestructive('Delete?', { force: true });
        expect(result).toBe(true);
        expect(mockConfirm).not.toHaveBeenCalled();
    });

    it('returns true when args.yes is string "true"', async () => {
        const result = await confirmDestructive('Delete?', { yes: 'true' });
        expect(result).toBe(true);
        expect(mockConfirm).not.toHaveBeenCalled();
    });

    it('prompts when no yes/force and returns user choice true', async () => {
        mockConfirm.mockResolvedValueOnce(true);
        const result = await confirmDestructive('Delete?', {});
        expect(mockConfirm).toHaveBeenCalledTimes(1);
        expect(result).toBe(true);
    });

    it('prompts and returns false when user says no', async () => {
        mockConfirm.mockResolvedValueOnce(false);
        const result = await confirmDestructive('Delete?', {});
        expect(mockConfirm).toHaveBeenCalledTimes(1);
        expect(result).toBe(false);
    });
});
