import { text, isCancel, cancel } from '@clack/prompts';
import { cliRegistry } from '../registry.js';
import { getClientOrThrow, getProjectId } from '../config.js';
import { projectSelectPrompt } from '../utils/projectSelectPrompt.js';
import { getBodyFromArgs } from '../utils/resolveInputData.js';
import { confirmDestructive } from '../utils/confirmPrompt.js';
import { printTable } from '../utils/printTable.js';

async function ensureProjectId(args: Record<string, unknown>): Promise<string> {
    const client = await getClientOrThrow();
    const id = (args.projectId as string) ?? (args.project as string) ?? (await getProjectId(args));
    if (id) return id;
    return projectSelectPrompt(client);
}

export async function listModelsCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const { models } = await client.models.list(projectId);
    if (!models?.length && !args.quiet) {
        console.log('📂 No models in project.', projectId);
        return;
    }
    if (args.json) {
        console.log(JSON.stringify(models ?? [], null, 2));
        return;
    }
    if (!args.quiet) {
        printTable(
            [
                { key: 'id', header: 'id' },
                { key: 'label', header: 'label' }
            ],
            (models ?? []) as unknown as Record<string, unknown>[]
        );
    }
}

export async function getModelCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const modelId = args.id as string;
    if (!modelId) {
        console.error('Use --id=<modelId>');
        process.exit(1);
    }
    const { model } = await client.models.get(projectId, modelId);
    if (args.json) {
        console.log(JSON.stringify(model, null, 2));
        return;
    }
    if (!args.quiet) console.log(JSON.stringify(model, null, 2));
}

export async function createModelCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    let body = await getBodyFromArgs(args);
    if (!body || Object.keys(body).length === 0)
        body = { id: args.id, label: args.label } as Record<string, unknown>;
    if (!body.id) {
        const idVal = await text({
            message: 'Model ID:',
            validate: (v: string | undefined) => (!v?.trim() ? 'Required' : undefined)
        });
        if (isCancel(idVal)) {
            cancel('Cancelled.');
            process.exit(0);
        }
        const labelVal = await text({
            message: 'Label:',
            initialValue: idVal.trim()
        });
        if (isCancel(labelVal)) {
            cancel('Cancelled.');
            process.exit(0);
        }
        body = { id: idVal.trim(), label: (labelVal || idVal).trim() };
    }
    const { model } = await client.models.create(projectId, body);
    if (args.json) {
        console.log(JSON.stringify(model, null, 2));
        return;
    }
    if (!args.quiet) console.log('✅ Created model', model?.id);
}

export async function patchModelCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const modelId = args.id as string;
    if (!modelId) {
        console.error(
            'Model --id= is required. Example: moteur models patch --project=my-blog --id=posts --file=patch.json'
        );
        process.exit(1);
    }
    let patch = await getBodyFromArgs(args);
    if (!patch || Object.keys(patch).length === 0)
        patch = { label: args.label } as Record<string, unknown>;
    await client.models.update(projectId, modelId, patch);
    if (!args.quiet) console.log('✅ Updated model', modelId);
}

export async function deleteModelCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const modelId = args.id as string;
    if (!modelId) {
        console.error(
            'Model --id= is required. Example: moteur models delete --project=my-blog --id=posts'
        );
        process.exit(1);
    }
    const ok = await confirmDestructive(`Delete model "${modelId}".`, args);
    if (!ok) return;
    await client.models.delete(projectId, modelId);
    if (!args.quiet)
        console.log(
            '🗑️ Deleted model',
            modelId,
            '\n  List models: moteur models list --project=' + projectId
        );
}

cliRegistry.register('models', { name: '', description: 'List models', action: listModelsCommand });
cliRegistry.register('models', {
    name: 'list',
    description: 'List models',
    action: listModelsCommand
});
cliRegistry.register('models', {
    name: 'get',
    description: 'Get one model',
    action: getModelCommand
});
cliRegistry.register('models', {
    name: 'create',
    description: 'Create a model',
    action: createModelCommand
});
cliRegistry.register('models', {
    name: 'patch',
    description: 'Update a model',
    action: patchModelCommand
});
cliRegistry.register('models', {
    name: 'delete',
    description: 'Delete a model',
    action: deleteModelCommand
});
