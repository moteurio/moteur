import { describe, expect, it } from 'vitest';
import type { Router } from 'express';
import {
    requireDeveloper,
    requireProjectAccess,
    requireProjectAdmin
} from '../../src/middlewares/auth.js';
import blocks from '../../src/studio/blocks.js';
import structures from '../../src/studio/structures/index.js';
import templates from '../../src/studio/templates/index.js';
import layouts from '../../src/studio/layouts/index.js';
import forms from '../../src/studio/forms/index.js';
import channels from '../../src/projects/collections/public.js';

type Layer = {
    route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] };
    handle?: { stack?: Layer[] };
};

/** Every route of a router, with its middlewares, nested routers included. */
function routes(router: Router): { method: string; path: string; handles: unknown[] }[] {
    const out: { method: string; path: string; handles: unknown[] }[] = [];
    for (const layer of (router as unknown as { stack: Layer[] }).stack) {
        if (layer.route)
            for (const method of Object.keys(layer.route.methods))
                out.push({
                    method,
                    path: layer.route.path,
                    handles: layer.route.stack.map(s => s.handle)
                });
    }
    return out;
}

const writes = (router: Router) => {
    const found = routes(router).filter(r => ['post', 'put', 'patch', 'delete'].includes(r.method));
    // A router with nothing to check would pass for nothing.
    expect(found.length).toBeGreaterThan(0);
    return found;
};

describe('who may change how a project is built', () => {
    it.each([
        ['blocks', blocks],
        ['structures', structures],
        ['templates', templates],
        ['layouts', layouts]
    ])('%s: admins only (checking a template stays open)', (_name, router) => {
        for (const r of writes(router as Router)) {
            if (r.path.endsWith('/validate')) continue;
            expect(r.handles, `${r.method} ${r.path}`).toContain(requireProjectAdmin);
            expect(r.handles, `${r.method} ${r.path}`).not.toContain(requireProjectAccess);
        }
    });

    it('forms: admins change them, visitors still send them', () => {
        for (const r of writes(forms as Router)) {
            if (r.path === '/:formId/submit') continue;
            expect(r.handles, `${r.method} ${r.path}`).toContain(requireProjectAdmin);
        }
    });

    it('channels: developers only, as in the Studio', () => {
        for (const r of writes(channels as Router))
            expect(r.handles, `${r.method} ${r.path}`).toContain(requireDeveloper);
    });
});
