import type { ProjectSchema } from '@moteurio/types/Project.js';
import type { StorageAdapter } from './StorageAdapter.js';

const adapters = new Map<string, StorageAdapter>();

export type StorageAdapterFactory = (config: unknown) => StorageAdapter;
const adapterFactories = new Map<string, StorageAdapterFactory>();

export function registerAdapter(adapter: StorageAdapter): void {
    adapters.set(adapter.id, adapter);
}

/** Register a factory for project-level adapter config (e.g. s3, r2). Used by plugins. */
export function registerAdapterFactory(id: string, factory: StorageAdapterFactory): void {
    adapterFactories.set(id, factory);
}

export function getAdapter(id: string): StorageAdapter | null {
    return adapters.get(id) ?? null;
}

export function getProjectAdapter(project: ProjectSchema): StorageAdapter {
    const id = project.assetConfig?.adapter ?? 'local';
    const config = project.assetConfig?.adapterConfig;
    const factory = adapterFactories.get(id);
    if (factory && config) {
        try {
            return factory(config);
        } catch (e) {
            throw new Error(
                (e as Error)?.message ?? `[moteur] Asset storage adapter "${id}" failed to create.`
            );
        }
    }
    const adapter = getAdapter(id);
    if (!adapter) {
        throw new Error(
            `[moteur] Asset storage adapter "${id}" not found. Enable the plugin or use a registered adapter.`
        );
    }
    return adapter;
}
