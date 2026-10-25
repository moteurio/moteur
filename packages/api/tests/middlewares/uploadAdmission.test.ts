import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadAdmission } from '../../src/middlewares/uploadAdmission.js';

describe('upload admission', () => {
    afterEach(() => vi.unstubAllEnvs());
    it('rejects excess uploads before buffering and releases a slot once on finish/close', () => {
        vi.stubEnv('API_UPLOAD_CONCURRENCY', '1');
        const response = () =>
            Object.assign(new EventEmitter(), {
                setHeader: vi.fn(),
                status: vi.fn().mockReturnThis(),
                json: vi.fn()
            });
        const first = response();
        const next = vi.fn();
        uploadAdmission({} as never, first as never, next);
        expect(next).toHaveBeenCalledOnce();
        const denied = response();
        const deniedNext = vi.fn();
        uploadAdmission({} as never, denied as never, deniedNext);
        expect(denied.status).toHaveBeenCalledWith(429);
        expect(deniedNext).not.toHaveBeenCalled();
        first.emit('finish');
        first.emit('close');
        const admitted = response();
        uploadAdmission({} as never, admitted as never, next);
        expect(next).toHaveBeenCalledTimes(2);
        admitted.emit('close');
    });
});
