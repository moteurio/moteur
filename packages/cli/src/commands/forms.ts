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

export async function listFormsCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const { forms } = await prj.forms.list();
    if (args.json) {
        console.log(JSON.stringify(forms ?? [], null, 2));
        return;
    }
    (forms ?? []).forEach((f: Record<string, unknown>) =>
        console.log(`- ${f.id} (${f.label ?? f.id})`)
    );
}

export async function getFormCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const formId = args.id as string;
    if (!formId) {
        console.error('Use --id=<formId>');
        process.exit(1);
    }
    const { form } = await prj.forms.get(formId);
    console.log(JSON.stringify(form, null, 2));
}

export async function createFormCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const body =
        (await getBodyFromArgs(args)) ??
        ({ id: args.id, label: args.label } as Record<string, unknown>);
    const { form } = await prj.forms.create(body);
    if (!args.quiet) console.log('✅ Created form', form?.id);
}

export async function patchFormCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const formId = args.id as string;
    if (!formId) {
        console.error(
            'Form --id= is required. Example: moteur forms patch --project=x --id=contact --file=patch.json'
        );
        process.exit(1);
    }
    const patch = (await getBodyFromArgs(args)) ?? {};
    await prj.forms.update(formId, patch);
    if (!args.quiet) console.log('✅ Updated form', formId);
}

export async function deleteFormCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const formId = args.id as string;
    if (!formId) {
        console.error('Form --id= is required.');
        process.exit(1);
    }
    const ok = await confirmDestructive(`Delete form "${formId}".`, args);
    if (!ok) return;
    await prj.forms.delete(formId);
    if (!args.quiet) console.log('🗑️ Deleted form', formId);
}

cliRegistry.register('forms', { name: '', description: 'List forms', action: listFormsCommand });
cliRegistry.register('forms', {
    name: 'list',
    description: 'List forms',
    action: listFormsCommand
});
cliRegistry.register('forms', { name: 'get', description: 'Get form', action: getFormCommand });
cliRegistry.register('forms', {
    name: 'create',
    description: 'Create form',
    action: createFormCommand
});
cliRegistry.register('forms', {
    name: 'patch',
    description: 'Update form',
    action: patchFormCommand
});
cliRegistry.register('forms', {
    name: 'delete',
    description: 'Delete form',
    action: deleteFormCommand
});
