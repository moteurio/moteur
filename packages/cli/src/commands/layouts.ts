import { cliRegistry } from '../registry.js';
import { getClientOrThrow, getProjectId } from '../config.js';
import { projectSelectPrompt } from '../utils/projectSelectPrompt.js';
import { getBodyFromArgs } from '../utils/resolveInputData.js';
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

export async function listLayoutsCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const { layouts } = await prj.layouts.list();
    if (args.json) {
        console.log(JSON.stringify(layouts ?? [], null, 2));
        return;
    }
    (layouts ?? []).forEach((l: Record<string, unknown>) => console.log(`- ${l.id} (${l.label})`));
}

export async function getLayoutCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const layoutId = args.id as string;
    if (!layoutId) {
        console.error('Use --id=<layoutId>');
        process.exit(1);
    }
    const { layout } = await prj.layouts.get(layoutId);
    console.log(JSON.stringify(layout, null, 2));
}

export async function createLayoutCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const body =
        (await getBodyFromArgs(args)) ??
        ({ id: args.id, label: args.label } as Record<string, unknown>);
    const { layout } = await prj.layouts.create(body);
    if (!args.quiet) console.log('✅ Created layout', layout?.id);
}

export async function patchLayoutCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const layoutId = args.id as string;
    if (!layoutId) {
        console.error(
            'Layout --id= is required. Example: moteur layouts patch --project=x --id=main --file=patch.json'
        );
        process.exit(1);
    }
    const patch = (await getBodyFromArgs(args)) ?? {};
    await prj.layouts.update(layoutId, patch);
    if (!args.quiet) console.log('✅ Updated layout', layoutId);
}

export async function deleteLayoutCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const layoutId = args.id as string;
    if (!layoutId) {
        console.error('Layout --id= is required.');
        process.exit(1);
    }
    const ok = await confirmDestructive(`Delete layout "${layoutId}".`, args);
    if (!ok) return;
    await prj.layouts.delete(layoutId);
    if (!args.quiet) console.log('🗑️ Deleted layout', layoutId);
}

cliRegistry.register('layouts', {
    name: '',
    description: 'List layouts',
    action: listLayoutsCommand
});
cliRegistry.register('layouts', {
    name: 'list',
    description: 'List layouts',
    action: listLayoutsCommand
});
cliRegistry.register('layouts', {
    name: 'get',
    description: 'Get layout',
    action: getLayoutCommand
});
cliRegistry.register('layouts', {
    name: 'create',
    description: 'Create layout',
    action: createLayoutCommand
});
cliRegistry.register('layouts', {
    name: 'patch',
    description: 'Update layout',
    action: patchLayoutCommand
});
cliRegistry.register('layouts', {
    name: 'delete',
    description: 'Delete layout',
    action: deleteLayoutCommand
});
