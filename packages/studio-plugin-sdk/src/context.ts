import type { StudioHostAdapter } from './types.js';
import type { StudioContributionCollector } from './contributions.js';

export type StudioPluginContext = {
    pluginId: string;
    registerFieldEditor: StudioHostAdapter['registerFieldEditor'];
    registerBlockPreview: StudioHostAdapter['registerBlockPreview'];
    registerProjectRoute: StudioHostAdapter['registerProjectRoute'];
    registerOperatorRoute: StudioHostAdapter['registerOperatorRoute'];
};

export function createStudioPluginContext(
    pluginId: string,
    host: StudioHostAdapter,
    collector?: StudioContributionCollector
): StudioPluginContext {
    return {
        pluginId,
        registerFieldEditor: (type, component) => {
            collector?.addFieldEditor(type);
            host.registerFieldEditor(type, component);
        },
        registerBlockPreview: (type, component) => {
            collector?.addBlockPreview(type);
            host.registerBlockPreview(type, component, pluginId);
        },
        registerProjectRoute: route => {
            collector?.addProjectRoute(route.path);
            host.registerProjectRoute(route);
        },
        registerOperatorRoute: route => {
            collector?.addOperatorRoute(route.path);
            host.registerOperatorRoute(route);
        }
    };
}
