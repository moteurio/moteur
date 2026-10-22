import type { StudioHostAdapter } from './types.js';

export type StudioPluginContext = {
    pluginId: string;
    registerFieldEditor: StudioHostAdapter['registerFieldEditor'];
    registerBlockPreview: StudioHostAdapter['registerBlockPreview'];
    registerProjectRoute: StudioHostAdapter['registerProjectRoute'];
    registerOperatorRoute: StudioHostAdapter['registerOperatorRoute'];
};

export function createStudioPluginContext(
    pluginId: string,
    host: StudioHostAdapter
): StudioPluginContext {
    return {
        pluginId,
        registerFieldEditor: (type, component) => host.registerFieldEditor(type, component),
        registerBlockPreview: (type, component) =>
            host.registerBlockPreview(type, component, pluginId),
        registerProjectRoute: route => host.registerProjectRoute(route),
        registerOperatorRoute: route => host.registerOperatorRoute(route)
    };
}
