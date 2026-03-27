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

export async function listStructuresCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const { structures } = await prj.structures.list();
    if (args.json) {
        console.log(JSON.stringify(structures ?? [], null, 2));
        return;
    }
    (structures ?? []).forEach((s: Record<string, unknown>) =>
        console.log(`- ${s.id} (${s.label})`)
    );
}

export async function getStructureCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const structureId = args.id as string;
    if (!structureId) {
        console.error('Use --id=<structureId>');
        process.exit(1);
    }
    const { structure } = await prj.structures.get(structureId);
    console.log(JSON.stringify(structure, null, 2));
}

export async function createStructureCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const body =
        (await getBodyFromArgs(args)) ??
        ({ id: args.id, label: args.label } as Record<string, unknown>);
    const { structure } = await prj.structures.create(body);
    if (!args.quiet) console.log('✅ Created structure', structure?.id);
}

export async function patchStructureCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const structureId = args.id as string;
    if (!structureId) {
        console.error(
            'Structure --id= is required. Example: moteur structures patch --project=x --id=hero --file=patch.json'
        );
        process.exit(1);
    }
    const patch = (await getBodyFromArgs(args)) ?? {};
    await prj.structures.update(structureId, patch);
    if (!args.quiet) console.log('✅ Updated structure', structureId);
}

export async function deleteStructureCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const structureId = args.id as string;
    if (!structureId) {
        console.error('Structure --id= is required.');
        process.exit(1);
    }
    const ok = await confirmDestructive(`Delete structure "${structureId}".`, args);
    if (!ok) return;
    await prj.structures.delete(structureId);
    if (!args.quiet) console.log('🗑️ Deleted structure', structureId);
}

cliRegistry.register('structures', {
    name: '',
    description: 'List structures',
    action: listStructuresCommand
});
cliRegistry.register('structures', {
    name: 'list',
    description: 'List structures',
    action: listStructuresCommand
});
cliRegistry.register('structures', {
    name: 'get',
    description: 'Get structure',
    action: getStructureCommand
});
cliRegistry.register('structures', {
    name: 'create',
    description: 'Create structure',
    action: createStructureCommand
});
cliRegistry.register('structures', {
    name: 'patch',
    description: 'Update structure',
    action: patchStructureCommand
});
cliRegistry.register('structures', {
    name: 'delete',
    description: 'Delete structure',
    action: deleteStructureCommand
});
