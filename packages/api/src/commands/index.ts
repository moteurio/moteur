import { Router, type IRouter } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { listPluginCommands } from '@moteurio/core';
import { requireAuth } from '../middlewares/auth.js';

export const commandsRouter: IRouter = Router();

commandsRouter.get('/', requireAuth, (_req, res) => {
    const surface =
        _req.query.surface === 'mcp' || _req.query.surface === 'cli'
            ? _req.query.surface
            : undefined;
    res.json({
        commands: listPluginCommands(surface ? { surface } : undefined).map(
            ({ pluginId: _pluginId, ...spec }) => spec
        )
    });
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/commands': {
        get: {
            summary: 'Commands plugins registered for the CLI and MCP',
            tags: ['Commands'],
            security: [{ bearerAuth: [] }],
            parameters: [
                {
                    name: 'surface',
                    in: 'query',
                    schema: { type: 'string', enum: ['cli', 'mcp'] }
                }
            ],
            responses: { '200': { description: 'Plugin command specs' } }
        }
    }
};
