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

export async function listNavigationsCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const { navigations } = await prj.navigations.list();
    if (args.json) {
        console.log(JSON.stringify(navigations ?? [], null, 2));
        return;
    }
    (navigations ?? []).forEach((n: Record<string, unknown>) =>
        console.log(`- ${n.id} (${n.handle ?? n.id})`)
    );
}

export async function getNavigationCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const navigationId = args.id as string;
    if (!navigationId) {
        console.error('Use --id=<navigationId>');
        process.exit(1);
    }
    const { navigation } = await prj.navigations.get(navigationId);
    console.log(JSON.stringify(navigation, null, 2));
}

export async function createNavigationCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const body =
        (await getBodyFromArgs(args)) ?? ({ handle: args.handle } as Record<string, unknown>);
    const { navigation } = await prj.navigations.create(body);
    if (!args.quiet) console.log('✅ Created navigation', navigation?.id);
}

export async function patchNavigationCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const navigationId = args.id as string;
    if (!navigationId) {
        console.error(
            'Navigation --id= is required. Example: moteur navigations patch --project=x --id=main --file=patch.json'
        );
        process.exit(1);
    }
    const patch = (await getBodyFromArgs(args)) ?? {};
    await prj.navigations.update(navigationId, patch);
    if (!args.quiet) console.log('✅ Updated navigation', navigationId);
}

export async function deleteNavigationCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const navigationId = args.id as string;
    if (!navigationId) {
        console.error('Navigation --id= is required.');
        process.exit(1);
    }
    const ok = await confirmDestructive(`Delete navigation "${navigationId}".`, args);
    if (!ok) return;
    await prj.navigations.delete(navigationId);
    if (!args.quiet) console.log('🗑️ Deleted navigation', navigationId);
}

cliRegistry.register('navigations', {
    name: '',
    description: 'List navigations',
    action: listNavigationsCommand
});
cliRegistry.register('navigations', {
    name: 'list',
    description: 'List navigations',
    action: listNavigationsCommand
});
cliRegistry.register('navigations', {
    name: 'get',
    description: 'Get navigation',
    action: getNavigationCommand
});
cliRegistry.register('navigations', {
    name: 'create',
    description: 'Create navigation',
    action: createNavigationCommand
});
cliRegistry.register('navigations', {
    name: 'patch',
    description: 'Update navigation',
    action: patchNavigationCommand
});
cliRegistry.register('navigations', {
    name: 'delete',
    description: 'Delete navigation',
    action: deleteNavigationCommand
});
