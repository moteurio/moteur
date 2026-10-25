import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
    roles: ['writer'],
    reviewOnly: false,
    member: true,
    create: vi.fn(),
    checkout: vi.fn(),
    merge: vi.fn()
}));
vi.mock('@moteurio/core/auth.js', () => ({
    verifyJWT: () => ({ sub: 'u1' }),
    actingUser: (user: object) => ({
        ...user,
        ...(state.reviewOnly ? { agent: { name: 'test', reviewOnly: true } } : {})
    })
}));
vi.mock('@moteurio/core/users.js', () => ({
    getUserById: () => ({ id: 'u1', roles: ['developer'], projects: ['p1'], isActive: true })
}));
vi.mock('@moteurio/core/projects.js', () => ({
    getProject: async () => ({
        id: 'p1',
        users: state.member ? ['u1'] : [],
        memberRoles: { u1: state.roles }
    })
}));
vi.mock('@moteurio/core/git/index.js', () => ({
    isGitRepo: () => true,
    listBranches: () => [],
    getCurrentBranch: () => 'main',
    createBranch: state.create,
    checkoutBranch: state.checkout,
    mergeBranch: state.merge,
    push: () => true
}));
vi.mock('@moteurio/core/contentIndex/index.js', () => ({
    getContentIndex: async () => ({ invalidate: vi.fn() })
}));
import route from '../../src/projects/branches/index.js';

// Exercise the router and real authorization middleware without opening a listening socket.
function mutate(suffix: string, body: object): Promise<number> {
    return new Promise((resolve, reject) => {
        const req = {
            method: 'POST',
            url: suffix || '/',
            params: { projectId: 'p1' },
            headers: { authorization: 'Bearer test' },
            body
        };
        const res = {
            statusCode: 200,
            status(code: number) {
                this.statusCode = code;
                return this;
            },
            json() {
                resolve(this.statusCode);
            }
        };
        (route as any).handle(req, res, (error: unknown) =>
            reject(error ?? new Error('Route not handled'))
        );
    });
}
const mutations = [
    ['', { name: 'test' }],
    ['/switch', { branch: 'test' }],
    ['/merge', { sourceBranch: 'test' }]
] as const;

describe('branch authorization', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.roles = ['writer'];
        state.member = true;
        state.reviewOnly = false;
    });
    it.each(['writer', 'translator', 'billing', 'reviewer', 'admin'])(
        'refuses mutations for project role %s despite the account developer role',
        async role => {
            state.roles = [role];
            for (const [suffix, body] of mutations) {
                expect(await mutate(suffix, body)).toBe(403);
            }
            expect(state.create).not.toHaveBeenCalled();
            expect(state.checkout).not.toHaveBeenCalled();
            expect(state.merge).not.toHaveBeenCalled();
        }
    );
    it('refuses a review-only agent even with developer access', async () => {
        state.roles = ['developer'];
        state.reviewOnly = true;
        for (const [suffix, body] of mutations) {
            expect(await mutate(suffix, body)).toBe(403);
        }
    });
    it('allows an unrestricted project developer', async () => {
        state.roles = ['developer'];
        for (const [suffix, body] of mutations) {
            expect(await mutate(suffix, body)).toBe(suffix ? 200 : 201);
        }
        expect(state.create).toHaveBeenCalledOnce();
        expect(state.checkout).toHaveBeenCalledOnce();
        expect(state.merge).toHaveBeenCalledOnce();
    });
    it('refuses developers outside the project', async () => {
        state.roles = ['developer'];
        state.member = false;
        expect(await mutate('', { name: 'test' })).toBe(403);
    });
});
