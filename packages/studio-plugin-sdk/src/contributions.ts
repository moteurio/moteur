import type { PluginContributions } from '@moteurio/types/Plugin.js';
import { mergeContributions } from '@moteurio/types/Plugin.js';
import type { StudioPluginManifest } from './manifest.js';

/** Records what a Studio companion registers during `register()`. */
export class StudioContributionCollector {
    private fieldEditors: string[] = [];
    private blockPreviews: string[] = [];
    private projectRoutes: string[] = [];
    private operatorRoutes: string[] = [];

    addFieldEditor(type: string): void {
        if (type) this.fieldEditors.push(type);
    }

    addBlockPreview(type: string): void {
        if (type) this.blockPreviews.push(type);
    }

    addProjectRoute(path: string): void {
        if (path) this.projectRoutes.push(path);
    }

    addOperatorRoute(path: string): void {
        if (path) this.operatorRoutes.push(path);
    }

    snapshot(): PluginContributions {
        const studioUi: NonNullable<PluginContributions['studioUi']> = {};
        if (this.fieldEditors.length) studioUi.fieldEditors = [...this.fieldEditors];
        if (this.blockPreviews.length) studioUi.blockPreviews = [...this.blockPreviews];
        if (this.projectRoutes.length) studioUi.projectRoutes = [...this.projectRoutes];
        if (this.operatorRoutes.length) studioUi.operatorRoutes = [...this.operatorRoutes];
        return Object.keys(studioUi).length ? { studioUi } : {};
    }
}

const effective = new Map<string, PluginContributions>();

export function setStudioPluginContributions(
    id: string,
    manifest: StudioPluginManifest,
    derived: PluginContributions
): PluginContributions {
    const merged = mergeContributions(manifest.contributes, derived);
    effective.set(id, merged);
    return merged;
}

export function getStudioPluginContributions(id: string): PluginContributions {
    return effective.get(id) ?? {};
}

export function allStudioPluginContributions(): Record<string, PluginContributions> {
    return Object.fromEntries(effective);
}
