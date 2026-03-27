import { cliRegistry } from '../registry.js';
import { getClientOrThrow } from '../config.js';
import { getBodyFromArgs } from '../utils/resolveInputData.js';
import { confirmDestructive } from '../utils/confirmPrompt.js';

type Kind = 'project' | 'model' | 'structure' | 'template';

function ensureKind(args: Record<string, unknown>): Kind {
    const k = (args.kind as string) ?? (args.type as string);
    if (k === 'project' || k === 'model' || k === 'structure' || k === 'template') return k;
    console.error('Use --kind=project|model|structure|template');
    process.exit(1);
}

export async function listBlueprintsCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const kind = ensureKind(args);
    const { blueprints } = await client.blueprints.list(kind);
    if (args.json) {
        console.log(JSON.stringify(blueprints ?? [], null, 2));
        return;
    }
    (blueprints ?? []).forEach((b: Record<string, unknown>) => console.log(`- ${b.id}`));
}

export async function getBlueprintCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const kind = ensureKind(args);
    const blueprintId = args.id as string;
    if (!blueprintId) {
        console.error('Use --id=<blueprintId>');
        process.exit(1);
    }
    const blueprint = await client.blueprints.get(kind, blueprintId);
    console.log(JSON.stringify(blueprint, null, 2));
}

export async function createBlueprintCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const kind = ensureKind(args);
    const body = (await getBodyFromArgs(args)) ?? ({ id: args.id } as Record<string, unknown>);
    if (!body.id) {
        console.error(
            'Provide --id=, --file=path, or --data=\'{"id":"..."}\'. Example: moteur blueprints create --kind=project --file=blueprint.json'
        );
        process.exit(1);
    }
    const blueprint = await client.blueprints.create(kind, body);
    if (!args.quiet) console.log('✅ Created blueprint', blueprint?.id);
}

export async function patchBlueprintCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const kind = ensureKind(args);
    const blueprintId = args.id as string;
    if (!blueprintId) {
        console.error(
            'Blueprint --id= is required. Example: moteur blueprints patch --kind=project --id=my-blueprint --file=patch.json'
        );
        process.exit(1);
    }
    const patch = (await getBodyFromArgs(args)) ?? {};
    await client.blueprints.update(kind, blueprintId, patch);
    if (!args.quiet) console.log('✅ Updated blueprint', blueprintId);
}

export async function deleteBlueprintCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const kind = ensureKind(args);
    const blueprintId = args.id as string;
    if (!blueprintId) {
        console.error('Blueprint --id= is required.');
        process.exit(1);
    }
    const ok = await confirmDestructive(`Delete blueprint "${blueprintId}".`, args);
    if (!ok) return;
    await client.blueprints.delete(kind, blueprintId);
    if (!args.quiet) console.log('🗑️ Deleted blueprint', blueprintId);
}

cliRegistry.register('blueprints', {
    name: 'list',
    description: 'List blueprints (--kind=project|model|structure|template)',
    action: listBlueprintsCommand
});
cliRegistry.register('blueprints', {
    name: 'get',
    description: 'Get blueprint',
    action: getBlueprintCommand
});
cliRegistry.register('blueprints', {
    name: 'create',
    description: 'Create blueprint',
    action: createBlueprintCommand
});
cliRegistry.register('blueprints', {
    name: 'patch',
    description: 'Update blueprint',
    action: patchBlueprintCommand
});
cliRegistry.register('blueprints', {
    name: 'delete',
    description: 'Delete blueprint',
    action: deleteBlueprintCommand
});
cliRegistry.register('blueprints', {
    name: '',
    description: 'List blueprints',
    action: listBlueprintsCommand
});
