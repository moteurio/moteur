import { describe, it, expect, vi } from 'vitest';
import { onEvent, triggerEvent } from '../../src/utils/eventBus';

describe('eventBus', () => {
    it('should register and trigger events with context', async () => {
        const spy = vi.fn(async (ctx: { test: string }) => {
            expect(ctx.test).toBe('Hello!');
        });

        onEvent('block.beforeCreate' as any, spy);

        await triggerEvent('block.beforeCreate' as any, { test: 'Hello!' });

        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors from listeners', async () => {
        onEvent('block.beforeUpdate' as any, async () => {
            throw new Error('Boom!');
        });

        await expect(triggerEvent('block.beforeUpdate' as any, { test: 'Hi!' })).rejects.toThrow(
            'Boom!'
        );
    });
});
