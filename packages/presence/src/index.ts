/**
 * @moteurio/presence — Socket.IO presence, field locks, and ephemeral screen state (LWW).
 * See `moteur/docs/Presence API.md`. Env and core plugins are loaded by the API host, not here.
 */
export { createPresenceServer, type CreatePresenceServerOptions } from './server.js';
export { createPresenceRouter, presenceOpenApiPaths, attachPresenceServer } from './routes.js';
export { getOnlineUserIdsForProject, resolveOnlinePresenceMaxIdleMs } from './onlineUsers.js';
