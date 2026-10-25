import type { PluginCommandSpec } from '@moteurio/types/PluginCommand.js';
import { commandCliId, commandMcpId, commandSurfaces } from '@moteurio/types/PluginCommand.js';

export type RegisteredCommand = PluginCommandSpec & { pluginId?: string };

const commands = new Map<string, RegisteredCommand>();

function key(spec: PluginCommandSpec): string {
    return commandCliId(spec);
}

export function registerPluginCommand(spec: PluginCommandSpec, pluginId?: string): void {
    if (!spec?.group) return;
    commands.set(key(spec), { ...spec, pluginId });
}

export function listPluginCommands(filter?: {
    surface?: 'cli' | 'mcp';
    pluginId?: string;
}): RegisteredCommand[] {
    return [...commands.values()].filter(spec => {
        if (filter?.pluginId && spec.pluginId !== filter.pluginId) return false;
        if (filter?.surface && !commandSurfaces(spec).includes(filter.surface)) return false;
        return true;
    });
}

export function pluginCommandIds(spec: PluginCommandSpec): { cli?: string; mcp?: string } {
    const surfaces = commandSurfaces(spec);
    return {
        ...(surfaces.includes('cli') ? { cli: commandCliId(spec) } : {}),
        ...(surfaces.includes('mcp') ? { mcp: commandMcpId(spec) } : {})
    };
}

export function resetPluginCommands(): void {
    commands.clear();
}
