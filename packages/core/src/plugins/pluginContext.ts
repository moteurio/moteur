/**
 * Context passed to plugin init(). Provides hooks into the core event bus,
 * per-project enablement, storage adapters, and video providers.
 * Keep plugins self-contained: depend only on this context and minimal core APIs
 * so they can be moved to a separate repo later.
 */
import { onEvent } from '../utils/eventBus.js';
import { getProjectById } from '../projects.js';
import { registerAdapterFactory } from '../assets/adapterRegistry.js';
import { registerProviderFactory, setVideoProvidersConfig } from '../assets/providerRegistry.js';
import { registerBlockSchema as registerBlockSchemaCore } from '../blocks.js';
import { registerStructureSchema as registerStructureSchemaCore } from '../structures.js';
import { registerBlueprint as registerBlueprintCore } from '../blueprints.js';
import fieldRegistry from '../registry/FieldRegistry.js';
import { creditBalance, grantCredits, setCreditAllowance } from '../metering.js';
import {
    setCountLimit,
    setPeopleLimit,
    setProjectsLimit,
    setRequestQuota,
    setStorageLimit,
    setSubmissionQuota
} from '../planLimits.js';
import type { PluginInitContext } from '@moteurio/plugin-sdk';
import type { FieldSchema } from '@moteurio/types/Field.js';
import type { VideoProvidersConfig } from '@moteurio/types/Project.js';
import type { PlanLimitKind } from '@moteurio/types/Plugin.js';
import { ContributionCollector } from './contributionCollector.js';
import { pluginCommandIds, registerPluginCommand } from './commandRegistry.js';
import type { PluginCommandSpec } from '@moteurio/types/PluginCommand.js';
import {
    registerMediaGenerator as registerMediaGeneratorCore,
    registerMediaTransform as registerMediaTransformCore,
    registerMediaVariantPreset as registerMediaVariantPresetCore
} from './mediaPipeline.js';
import { registerModelTemplate as registerModelTemplateCore } from './modelTemplates.js';
import {
    registerGitCommitHook as registerGitCommitHookCore,
    registerGitProvider as registerGitProviderCore
} from './gitHooks.js';
import { registerOutboundWebhookEvent as registerOutboundWebhookEventCore } from './outboundEvents.js';

const globalScopePluginIds = new Set<string>();

export function setPluginScope(pluginId: string, scope: 'global' | 'project' = 'project'): void {
    if (scope === 'global') globalScopePluginIds.add(pluginId);
    else globalScopePluginIds.delete(pluginId);
}

/**
 * Check whether a plugin is enabled for a given project.
 * Plugins are active when registered on the server (MOTEUR_OPTIONAL_PLUGINS); they can then be enabled/disabled per-project (e.g. by project.plugins or tier).
 * When project.plugins is undefined, all server-enabled plugins are considered enabled for that project.
 * When project.plugins is set, only listed plugin IDs are enabled for that project.
 */
async function isPluginEnabledForProject(projectId: string, pluginId: string): Promise<boolean> {
    if (globalScopePluginIds.has(pluginId)) return true;
    const project = await getProjectById(projectId);
    if (!project) return false;
    const list = project.plugins;
    if (list === undefined || list === null) return true; // no list = all plugins enabled for project
    return Array.isArray(list) && list.includes(pluginId);
}

/** Core implementation uses typed `onEvent` from the event bus; plugin-sdk keeps factories loosely typed for third-party plugins. */
export type PluginContext = Omit<PluginInitContext, 'onEvent'> & {
    onEvent: typeof onEvent;
};

export function createPluginContext(): PluginContext {
    return {
        onEvent,
        isPluginEnabledForProject,
        registerStorageAdapterFactory:
            registerAdapterFactory as PluginInitContext['registerStorageAdapterFactory'],
        registerVideoProviderFactory:
            registerProviderFactory as PluginInitContext['registerVideoProviderFactory'],
        setVideoProvidersConfig,
        registerBlockSchema: registerBlockSchemaCore,
        registerStructureSchema: registerStructureSchemaCore,
        registerBlueprint: registerBlueprintCore,
        registerFieldSchema: (field: FieldSchema) => {
            fieldRegistry.register(field);
        },
        setCreditAllowance,
        setPeopleLimit,
        setStorageLimit,
        setRequestQuota,
        setProjectsLimit,
        setCountLimit,
        setSubmissionQuota,
        grantCredits,
        creditBalance: projectId => creditBalance(projectId),
        registerCommand: spec => registerPluginCommand(spec),
        registerMcpTool: spec => registerPluginCommand({ ...spec, surfaces: ['mcp'] }),
        registerMediaVariantPreset: preset => registerMediaVariantPresetCore(preset),
        registerMediaTransform: transform => registerMediaTransformCore(transform),
        registerMediaGenerator: generator => registerMediaGeneratorCore(generator),
        registerModelTemplate: schema => registerModelTemplateCore(schema),
        registerGitCommitHook: hook => registerGitCommitHookCore(hook),
        registerGitProvider: id => registerGitProviderCore(id),
        registerOutboundWebhookEvent: event => registerOutboundWebhookEventCore(event)
    };
}

/** Wrap a context so each hook records a contribution. */
export function wrapPluginContext(
    ctx: PluginContext,
    collector: ContributionCollector,
    pluginId?: string
): PluginContext {
    return {
        ...ctx,
        onEvent: (name, callback) => {
            collector.addEvent(String(name));
            return ctx.onEvent(name, callback);
        },
        registerBlockSchema: schema => {
            collector.addBlock(schema.type);
            ctx.registerBlockSchema(schema);
        },
        registerStructureSchema: schema => {
            collector.addStructure(schema.type);
            ctx.registerStructureSchema(schema);
        },
        registerBlueprint: blueprint => {
            collector.addBlueprint(blueprint.id);
            ctx.registerBlueprint(blueprint);
        },
        registerFieldSchema: field => {
            collector.addField(field.type);
            ctx.registerFieldSchema(field);
        },
        registerStorageAdapterFactory: (id, factory) => {
            collector.addStorageAdapter(id);
            ctx.registerStorageAdapterFactory(id, factory);
        },
        registerVideoProviderFactory: (id, factory) => {
            collector.addVideoProvider(id);
            ctx.registerVideoProviderFactory(id, factory);
        },
        setVideoProvidersConfig: (config: VideoProvidersConfig | null) => {
            if (config?.active) collector.setActiveVideoProvider(config.active);
            ctx.setVideoProvidersConfig(config);
        },
        setCreditAllowance: allowance => {
            collector.setPlanLimit('aiCredits');
            ctx.setCreditAllowance(allowance);
        },
        setPeopleLimit: limit => {
            collector.setPlanLimit('people');
            ctx.setPeopleLimit(limit);
        },
        setStorageLimit: limit => {
            collector.setPlanLimit('storageBytes');
            ctx.setStorageLimit(limit);
        },
        setRequestQuota: quota => {
            collector.setPlanLimit('apiRequests');
            ctx.setRequestQuota(quota);
        },
        setSubmissionQuota: quota => {
            collector.setPlanLimit('formSubmissions');
            ctx.setSubmissionQuota(quota);
        },
        setProjectsLimit: limit => {
            collector.setPlanLimit('projectsPerUser');
            ctx.setProjectsLimit(limit);
        },
        setCountLimit: limit => {
            collector.addCountKinds([
                'channels',
                'models',
                'entries',
                'forms',
                'structures',
                'blocks',
                'templates',
                'pages'
            ] satisfies PlanLimitKind[]);
            ctx.setCountLimit(limit);
        },
        grantCredits: (projectId, amount, detail) => {
            collector.markCreditsMutated();
            return ctx.grantCredits(projectId, amount, detail);
        },
        registerCommand: spec => {
            const ids = pluginCommandIds(spec);
            collector.addCommand(ids.cli, ids.mcp);
            registerPluginCommand(spec, pluginId);
        },
        registerMcpTool: spec => {
            const tool = { ...spec, surfaces: ['mcp'] as PluginCommandSpec['surfaces'] };
            const ids = pluginCommandIds(tool);
            collector.addCommand(ids.cli, ids.mcp);
            registerPluginCommand(tool, pluginId);
        },
        registerMediaVariantPreset: preset => {
            collector.addMediaVariant(preset.id);
            registerMediaVariantPresetCore(preset, pluginId);
        },
        registerMediaTransform: transform => {
            collector.addMediaTransform(transform.id);
            registerMediaTransformCore(transform, pluginId);
        },
        registerMediaGenerator: generator => {
            collector.addMediaGenerator(generator.id);
            registerMediaGeneratorCore(generator, pluginId);
        },
        registerModelTemplate: schema => {
            collector.addModel(schema.id);
            ctx.registerModelTemplate(schema);
        },
        registerGitCommitHook: hook => {
            collector.markGitCommitHook();
            ctx.registerGitCommitHook(hook);
        },
        registerGitProvider: id => {
            collector.addGitProvider(id);
            ctx.registerGitProvider(id);
        },
        registerOutboundWebhookEvent: event => {
            collector.addOutboundWebhookEvent(event);
            ctx.registerOutboundWebhookEvent(event);
        }
    };
}
