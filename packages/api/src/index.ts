/**
 * Moteur API — Express server entry point.
 *
 * AUTH MODEL
 * ==========
 * - JWT (Bearer token): Required for all routes by default. Used by Studio and
 *   operators. Middleware: requireAuth, requireProjectAccess, requireOperator.
 *
 * - API Key (x-api-key header only; query keys are not supported — they leak in logs/referrers): Used by public
 *   frontends to consume published content. Projects may have multiple keys; each may have allowedHosts, optional
 *   collection allowlists, and optional site-wide read access. Optional per-key allowedHosts restrict x-api-key to matching
 *   Origin/Referer hostnames (exact or *.single-label prefix); see Authentication.md. Read-only (GET only). Applies to:
 *     - Collections (/projects/:projectId/collections)
 *     - Page outputs (/projects/:projectId/sitemap.xml, sitemap.json, navigation, urls, breadcrumb)
 *     - Radar (/projects/:projectId/radar)
 *   Middleware: optionalAuth + apiKeyAuth + requireCollectionOrProjectAccess.
 *
 * - No auth (intentional exceptions):
 *     - Health: GET /health (liveness for load balancers and orchestrators)
 *     - Auth endpoints: /auth/login, /auth/providers (login flow)
 *     - Form submissions: POST /projects/:projectId/forms/:formId/submit (rate-limited)
 *     - Webhooks: POST /webhooks/mux, /webhooks/vimeo, /webhooks/cloudflare-stream, /webhooks/slack, /webhooks/vercel, /webhooks/github (signature-verified where applicable)
 *     - Static assets: GET {API_BASE_PATH}/static/assets/:projectId/:variantKey/:filename
 */
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';

// Load env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../../../.env') });

import fs from 'fs';
import path from 'path';
import express, { Router } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { apiReference } from '@scalar/express-api-reference';

import { createAuthRouter } from './auth/index.js';
import projectRoutes from './projects/index.js';
import blueprintsRoutes from './blueprints/index.js';
import modelsRoute from './models/index.js';
import entriesRoute from './entries/index.js';
import activityGlobalRoute from './activity/index.js';
import operatorRoute from './operator/index.js';
import operatorAuthRoute from './operator/auth.js';
import invitesRoute from './invites/index.js';
import { mcpRouter } from './mcp/index.js';
import usageRouter from './studio/usage.js';
import fieldTypesRouter from './studio/fieldTypes.js';
import assetsMigrateRouter from './studio/assets/migrate.js';
import seedRouter from './studio/seed.js';
import blocksRouter from './blocks/index.js';
import webhooksAssetsRouter from './webhooks/assets.js';
import { storageConfig, validateStorageConfig } from '@moteurio/core';
import { schedulerEngine, startSnapshotScheduler, stopSnapshotScheduler } from '@moteurio/core';
import { globalErrorHandler } from './middlewares/errorHandler.js';
import { registerSocketEventBridge } from './bootstrap/socketEventBridge.js';
import { mountResizedImages, mountStaticAssets } from './bootstrap/staticAssetsRoute.js';
import { resumeImageCopies, resumeVideoUploads } from '@moteurio/core/assets/assetService.js';
import { loadProjects } from '@moteurio/core/projects.js';
import {
    createFileMeteringStore,
    getMeteringStore,
    setMeteringStore
} from '@moteurio/core/metering.js';

// Load core runtime. External plugins are discovered by host config (MOTEUR_HOST_PLUGINS / MOTEUR_ENABLED_PLUGINS).
import '@moteurio/core';
import { securityHeaders } from './middlewares/security.js';
import { requestClassifier } from './middlewares/requestClassifier.js';
import { usageLogging } from './middlewares/usageLogging.js';
import { requestQuota } from './middlewares/requestQuota.js';
import { studioRateLimiter, publicRateLimitGate } from './middlewares/rateLimit.js';
import { bootstrapApi } from './openapi/bootstrapApi.js';
// Ensure asset storage adapters (e.g. local) are registered before any asset routes run
import '@moteurio/core/assets/index.js';
// Video provider config (Mux/Vimeo) is set by video-mux and video-vimeo plugins when enabled

/** Log and exit on fatal process errors (before server listen and during runtime). */
function registerProcessFatalHandlers(): void {
    process.on('unhandledRejection', (reason: unknown) => {
        const message =
            reason instanceof Error
                ? reason.message
                : typeof reason === 'string'
                  ? reason
                  : String(reason);
        const stack = reason instanceof Error ? reason.stack : undefined;
        console.error('[API fatal]', { event: 'unhandledRejection', message, stack }, reason);
        process.exit(1);
    });
    process.on('uncaughtException', (err: Error, origin: string) => {
        console.error(
            '[API fatal]',
            { event: 'uncaughtException', origin, message: err.message, stack: err.stack },
            err
        );
        process.exit(1);
    });
}
registerProcessFatalHandlers();

// CORS: only origins in CORS_ORIGINS (comma-separated) are allowed. Unset = none — set explicitly for every environment.
function getCorsOrigin(): string | string[] {
    const env = process.env.CORS_ORIGINS?.trim();
    if (!env) return [];
    return env
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

// Create Express app
const app = express();

const basePath = process.env.API_BASE_PATH || '';

app.use(securityHeaders);
app.use(
    cors({
        origin: getCorsOrigin(),
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
        exposedHeaders: ['X-Total-Count', 'Retry-After']
    })
);

// Request counts and AI credits survive restarts. Set before plugins load: a host plugin may
// replace the store (e.g. a database for several API instances) in its init.
setMeteringStore(
    createFileMeteringStore(
        process.env.MOTEUR_METERING_DIR?.trim() ||
            path.join(storageConfig.dataRoot, 'data', 'metering')
    )
);

const { mergedApiSpecs, serverUrl, hostPlugins, pluginRouteContributions, authProviders } =
    await bootstrapApi();

const webhookContribs = pluginRouteContributions.filter(c => c.path === '/webhooks');
// Mount webhooks before JSON body parser so signature verification gets raw body
const bodyLimit = process.env.API_BODY_LIMIT || '1mb';

app.use(
    basePath + '/webhooks',
    express.raw({ type: 'application/json', limit: bodyLimit }),
    (req: express.Request, _res: express.Response, next: express.NextFunction) => {
        if (Buffer.isBuffer(req.body)) req.rawBody = req.body.toString('utf8');
        next();
    },
    webhooksAssetsRouter,
    ...webhookContribs.map(c => c.router)
);

app.use(express.json({ limit: bodyLimit }));

// Request classification (studio vs public), usage logging, and rate limiting
app.use(basePath, requestClassifier);
app.use(basePath, usageLogging);
app.use(basePath + '/studio', studioRateLimiter);
app.use(basePath, publicRateLimitGate);
app.use(basePath, requestQuota);

const router: Router = express.Router();
router.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
});
router.get('/openapi.json', async (req, res) => {
    res.json(mergedApiSpecs);
});

app.use(basePath, router);
app.use(
    basePath + '/docs',
    apiReference({
        content: mergedApiSpecs,
        ...(basePath ? { baseServerURL: serverUrl } : {})
    })
);

// Merge plugin contributions by path: /auth, /projects, /webhooks get merged with core routers; others grouped by path
const authContribs = pluginRouteContributions.filter(c => c.path === '/auth');
const projectContribs = pluginRouteContributions.filter(c => c.path === '/projects');
const otherContribs = pluginRouteContributions.filter(
    c => c.path !== '/auth' && c.path !== '/projects' && c.path !== '/webhooks'
);

const mergedAuthRouter = express.Router();
mergedAuthRouter.use(createAuthRouter(authProviders));
for (const c of authContribs) mergedAuthRouter.use(c.router);
app.use(basePath + '/auth', mergedAuthRouter);

const otherByPath = new Map<string, typeof pluginRouteContributions>();
for (const c of otherContribs) {
    const list = otherByPath.get(c.path) ?? [];
    list.push(c);
    otherByPath.set(c.path, list);
}
for (const [p, contribs] of otherByPath) {
    const r = express.Router();
    for (const c of contribs) r.use(c.router);
    app.use(basePath + p, r);
}

// Mount models and entries before the generic projects router so that
// GET /projects/:projectId/models and GET /projects/:projectId/models/:modelId/entries
// are matched here instead of 404ing in the projects router.
app.use(basePath + '/projects/:projectId/models/:modelId/entries', entriesRoute);
app.use(basePath + '/projects/:projectId/models', modelsRoute);

const mergedProjectsRouter = express.Router();
mergedProjectsRouter.use(projectRoutes);
for (const c of projectContribs) mergedProjectsRouter.use(c.router);
app.use(basePath + '/projects', mergedProjectsRouter);

app.use(basePath + '/blueprints', blueprintsRoutes);
app.use(basePath + '/activity', activityGlobalRoute);
// Operators' own sign-in first: everything else under /operator needs its token.
app.use(basePath + '/operator/auth', operatorAuthRoute);
app.use(basePath + '/operator', operatorRoute);
app.use(basePath + '/invites', invitesRoute);
// MCP for remote AI clients; its tools call this API itself. MOTEUR_MCP=off leaves it out.
if (process.env.MOTEUR_MCP?.trim().toLowerCase() !== 'off') {
    app.use(
        basePath + '/mcp',
        studioRateLimiter,
        mcpRouter(() => `http://127.0.0.1:${process.env.PORT || 3000}${basePath}`, mergedApiSpecs)
    );
}
app.use(basePath + '/studio/usage', usageRouter);
app.use(basePath + '/studio/field-types', fieldTypesRouter);
app.use(basePath + '/studio/seed', seedRouter);
app.use(basePath + '/studio/assets', assetsMigrateRouter);
app.use(basePath + '/moteur/blocks', blocksRouter);

mountStaticAssets(app, basePath);
mountResizedImages(app, basePath);

/** Studio user avatars from `data/avatars` (paths like `/avatars/64/lion.png` in users.json). */
const studioAvatarsDir = path.join(storageConfig.dataRoot, 'data', 'avatars');
if (fs.existsSync(studioAvatarsDir)) {
    app.use(basePath + '/avatars', express.static(studioAvatarsDir, { maxAge: '7d' }));
}

app.use(globalErrorHandler);

// 🔧 Create HTTP server wrapper
const httpServer = createServer(app);

// Host plugins may attach to the server (e.g. presence Socket.IO on app.locals.io)
for (const plugin of hostPlugins) {
    try {
        const attach = plugin.attachServer;
        if (typeof attach === 'function') {
            (attach as (s: import('http').Server, a: express.Express) => void)(httpServer, app);
        }
    } catch (err) {
        console.warn(
            `[api] Failed to attach server for plugin "${plugin.manifest.id}":`,
            (err as Error).message
        );
    }
}

registerSocketEventBridge(app);

// Validate storage paths before accepting connections
validateStorageConfig();

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, async () => {
    console.log(`Moteur API running at http://localhost:${PORT}`);
    try {
        await schedulerEngine.init();
    } catch (err) {
        console.error('[Moteur] Scheduler init failed:', err);
    }
    startSnapshotScheduler(60_000);
    // Images uploaded just before a restart still need their resized copies.
    try {
        const queued = await resumeImageCopies(loadProjects());
        if (queued) console.log(`[Moteur] Making copies for ${queued} image(s) left processing`);
    } catch (err) {
        console.error('[Moteur] Resuming image copies failed:', err);
    }
    // Videos on their way to a host (Mux, Vimeo…), or still processing there.
    try {
        const resumed = await resumeVideoUploads(loadProjects());
        if (resumed) console.log(`[Moteur] Following ${resumed} video(s) at their host`);
    } catch (err) {
        console.error('[Moteur] Resuming video uploads failed:', err);
    }
});

function gracefulShutdown(): void {
    schedulerEngine.stopSweep();
    stopSnapshotScheduler();
    getMeteringStore().flush();
    process.exit(0);
}
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
