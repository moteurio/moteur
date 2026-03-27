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

export async function listTemplatesCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const { templates } = await prj.templates.list();
    if (args.json) {
        console.log(JSON.stringify(templates ?? [], null, 2));
        return;
    }
    (templates ?? []).forEach((t: Record<string, unknown>) =>
        console.log(`- ${t.id} (${t.label})`)
    );
}

export async function getTemplateCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const templateId = args.id as string;
    if (!templateId) {
        console.error('Use --id=<templateId>');
        process.exit(1);
    }
    const { template } = await prj.templates.get(templateId);
    console.log(JSON.stringify(template, null, 2));
}

export async function createTemplateCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const body =
        (await getBodyFromArgs(args)) ??
        ({ id: args.id, label: args.label } as Record<string, unknown>);
    const { template } = await prj.templates.create(body);
    if (!args.quiet) console.log('✅ Created template', template?.id);
}

export async function patchTemplateCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const templateId = args.id as string;
    if (!templateId) {
        console.error(
            'Template --id= is required. Example: moteur templates patch --project=x --id=page --file=patch.json'
        );
        process.exit(1);
    }
    const patch = (await getBodyFromArgs(args)) ?? {};
    await prj.templates.update(templateId, patch);
    if (!args.quiet) console.log('✅ Updated template', templateId);
}

export async function deleteTemplateCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const templateId = args.id as string;
    if (!templateId) {
        console.error('Template --id= is required.');
        process.exit(1);
    }
    const ok = await confirmDestructive(`Delete template "${templateId}".`, args);
    if (!ok) return;
    await prj.templates.delete(templateId);
    if (!args.quiet) console.log('🗑️ Deleted template', templateId);
}

cliRegistry.register('templates', {
    name: '',
    description: 'List templates',
    action: listTemplatesCommand
});
cliRegistry.register('templates', {
    name: 'list',
    description: 'List templates',
    action: listTemplatesCommand
});
cliRegistry.register('templates', {
    name: 'get',
    description: 'Get template',
    action: getTemplateCommand
});
cliRegistry.register('templates', {
    name: 'create',
    description: 'Create template',
    action: createTemplateCommand
});
cliRegistry.register('templates', {
    name: 'patch',
    description: 'Update template',
    action: patchTemplateCommand
});
cliRegistry.register('templates', {
    name: 'delete',
    description: 'Delete template',
    action: deleteTemplateCommand
});
