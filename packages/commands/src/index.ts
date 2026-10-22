/**
 * Everything Moteur's API can do, as declared commands: shared by the `moteur` CLI and the MCP
 * server, so both offer the same things, named the same way, checked the same way.
 */
import { Commands } from './execute.js';
import { entries, models } from './commands/content.js';
import { activity, comments, notifications, reviews, schedules } from './commands/workflow.js';
import { pages, site } from './commands/site.js';
import { media, mediaSettings } from './commands/media.js';
import {
    blocks,
    fieldTypes,
    forms,
    layouts,
    menus,
    structures,
    submissions,
    templates
} from './commands/schemas.js';
import {
    branches,
    channels,
    invites,
    keys,
    members,
    projects,
    webhooks
} from './commands/project.js';
import { ai } from './commands/ai.js';
import {
    api,
    auth,
    billing,
    blueprints,
    operator,
    play,
    radar,
    search,
    shopify,
    status
} from './commands/platform.js';

export * from './spec.js';
export * from './execute.js';
export * from './format.js';
export * from './coverage.js';
export { crud, revisions, setPairs, SET_ARG } from './kit.js';
export {
    loadConfig,
    saveConfig,
    clearConfig,
    isWebSessionMode,
    getClient,
    getClientOrThrow,
    getProjectId,
    getConfigPath,
    type CliConfig
} from './config.js';

/** Every API command, in the order help lists them. */
export const API_COMMANDS = [
    ...auth,
    ...status,
    ...projects,
    ...entries,
    ...models,
    ...reviews,
    ...schedules,
    ...comments,
    ...notifications,
    ...activity,
    ...pages,
    ...site,
    ...menus,
    ...media,
    ...mediaSettings,
    ...templates,
    ...layouts,
    ...structures,
    ...blocks,
    ...forms,
    ...submissions,
    ...fieldTypes,
    ...members,
    ...invites,
    ...keys,
    ...channels,
    ...webhooks,
    ...branches,
    ...ai,
    ...radar,
    ...search,
    ...shopify,
    ...play,
    ...blueprints,
    ...billing,
    ...operator,
    ...api
];

/** The API commands as a findable list. */
export const apiCommands = (): Commands => new Commands().add(API_COMMANDS);
