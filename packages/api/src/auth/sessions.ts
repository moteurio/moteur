import { Router } from 'express';
import { verifyJWT } from '@moteurio/core/auth.js';
import { listAuthSessions, revokeAuthSession } from '@moteurio/core/authSessions.js';
import { requireAuth } from '../middlewares/auth.js';
import type { OpenAPIV3 } from 'openapi-types';

const router: Router = Router();
router.use(['/sessions', '/logout'], requireAuth);
router.get('/sessions', (req, res) => {
    if (req.user!.agent)
        return void res.status(403).json({ error: 'A personal session is required' });
    const payload = verifyJWT(req.headers.authorization!.replace(/^Bearer\s+/i, ''));
    res.setHeader('Cache-Control', 'no-store');
    res.json({
        sessions: listAuthSessions(req.user!.id, req.user!.authVersion ?? 0).map(session => ({
            id: session.id,
            label: session.label,
            kind: session.kind,
            createdAt: new Date(session.createdAt).toISOString(),
            expiresAt: new Date(session.expiresAt).toISOString(),
            current: session.id === payload.sid
        }))
    });
});
router.delete('/sessions/:sessionId', (req, res) => {
    if (req.user!.agent)
        return void res.status(403).json({ error: 'A personal session is required' });
    revokeAuthSession(req.user!.id, String(req.params.sessionId));
    res.status(204).end();
});
router.delete('/sessions', (req, res) => {
    if (req.user!.agent)
        return void res.status(403).json({ error: 'A personal session is required' });
    revokeAuthSession(req.user!.id);
    res.status(204).end();
});
router.post('/logout', (req, res) => {
    const payload = verifyJWT(req.headers.authorization!.replace(/^Bearer\s+/i, ''));
    revokeAuthSession(req.user!.id, String(payload.sid));
    res.status(204).end();
});
export default router;

const sessionResponse: OpenAPIV3.ResponseObject = {
    description: 'Active sessions for the signed-in account',
    content: {
        'application/json': {
            schema: {
                type: 'object',
                required: ['sessions'],
                properties: {
                    sessions: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                label: { type: 'string' },
                                kind: { type: 'string' },
                                createdAt: { type: 'string', format: 'date-time' },
                                expiresAt: { type: 'string', format: 'date-time' },
                                current: { type: 'boolean' }
                            }
                        }
                    }
                }
            }
        }
    }
};
const secured = { tags: ['Auth'], security: [{ bearerAuth: [] }] };
export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/auth/sessions': {
        get: {
            ...secured,
            summary: 'List active user and delegated sessions',
            responses: { '200': sessionResponse }
        },
        delete: {
            ...secured,
            summary: 'Revoke all account sessions',
            responses: { '204': { description: 'All sessions revoked' } }
        }
    },
    '/auth/sessions/{sessionId}': {
        delete: {
            ...secured,
            summary: 'Revoke a session and invalidate its delegated tokens',
            parameters: [
                { in: 'path', name: 'sessionId', required: true, schema: { type: 'string' } }
            ],
            responses: { '204': { description: 'Session revoked' } }
        }
    },
    '/auth/logout': {
        post: {
            ...secured,
            summary: 'Revoke the current session',
            responses: { '204': { description: 'Signed out' } }
        }
    }
};
