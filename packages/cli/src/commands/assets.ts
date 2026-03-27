import { cliRegistry } from '../registry.js';
import { getClientOrThrow, getProjectId } from '../config.js';
import { projectSelectPrompt } from '../utils/projectSelectPrompt.js';
import { confirmDestructive } from '../utils/confirmPrompt.js';

async function ensureProjectId(args: Record<string, unknown>): Promise<string> {
    const client = await getClientOrThrow();
    return (
        (args.projectId as string) ??
        (args.project as string) ??
        (await getProjectId(args)) ??
        (await projectSelectPrompt(client))
    );
}

export async function listAssetsCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const assets = await prj.assets.list({
        type: args.type as string,
        folder: args.folder as string,
        search: args.search as string
    });
    if (args.json) {
        console.log(JSON.stringify(assets ?? [], null, 2));
        return;
    }
    (assets ?? []).forEach((a: Record<string, unknown>) =>
        console.log(`- ${a.id} (${a.title ?? a.id})`)
    );
}

export async function getAssetCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const id = args.id as string;
    if (!id) {
        console.error('Use --id=<assetId>');
        process.exit(1);
    }
    const asset = await prj.assets.get(id);
    console.log(JSON.stringify(asset, null, 2));
}

export async function deleteAssetCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const id = args.id as string;
    if (!id) {
        console.error('Asset --id= is required.');
        process.exit(1);
    }
    const ok = await confirmDestructive(`Delete asset "${id}".`, args);
    if (!ok) return;
    await prj.assets.delete(id);
    if (!args.quiet) console.log('🗑️ Deleted asset', id);
}

export async function regenerateVariantsCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const assetIds = args.assetIds as string[] | undefined;
    const result = await prj.assets.regenerate(assetIds);
    if (!args.quiet) console.log('✅ Regenerated:', result?.regenerated ?? 0);
}

export async function getAssetConfigCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const config = await prj.assetConfig.get();
    console.log(JSON.stringify(config, null, 2));
}

export async function updateAssetConfigCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const patch = (args.data ? JSON.parse(String(args.data)) : {}) as Record<string, unknown>;
    await prj.assetConfig.update(patch);
    if (!args.quiet) console.log('✅ Updated asset config');
}

cliRegistry.register('assets', { name: '', description: 'List assets', action: listAssetsCommand });
cliRegistry.register('assets', {
    name: 'list',
    description: 'List assets',
    action: listAssetsCommand
});
cliRegistry.register('assets', { name: 'get', description: 'Get asset', action: getAssetCommand });
cliRegistry.register('assets', {
    name: 'delete',
    description: 'Delete asset',
    action: deleteAssetCommand
});
cliRegistry.register('assets', {
    name: 'regenerate-variants',
    description: 'Regenerate asset variants',
    action: regenerateVariantsCommand
});
cliRegistry.register('assets', {
    name: 'config',
    description: 'Get asset config',
    action: getAssetConfigCommand
});
cliRegistry.register('assets', {
    name: 'patch-config',
    description: 'Update asset config',
    action: updateAssetConfigCommand
});
