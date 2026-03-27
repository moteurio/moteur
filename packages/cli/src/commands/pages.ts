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

export async function listPagesCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const { pages } = await prj.pages.list();
    if (args.json) {
        console.log(JSON.stringify(pages ?? [], null, 2));
        return;
    }
    (pages ?? []).forEach((pg: Record<string, unknown>) =>
        console.log(`- ${pg.id} (${pg.slug ?? pg.id})`)
    );
}

export async function getPageCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const pageId = args.id as string;
    if (!pageId) {
        console.error('Use --id=<pageId>');
        process.exit(1);
    }
    const { page } = await prj.pages.get(pageId);
    console.log(JSON.stringify(page, null, 2));
}

export async function createPageCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const body =
        (await getBodyFromArgs(args)) ??
        ({ slug: args.slug, templateId: args.templateId } as Record<string, unknown>);
    const { page } = await prj.pages.create(body);
    if (!args.quiet) console.log('✅ Created page', page?.id);
}

export async function patchPageCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const pageId = args.id as string;
    if (!pageId) {
        console.error(
            'Page --id= is required. Example: moteur pages patch --project=x --id=page-1 --file=patch.json'
        );
        process.exit(1);
    }
    const patch = (await getBodyFromArgs(args)) ?? {};
    await prj.pages.update(pageId, patch);
    if (!args.quiet) console.log('✅ Updated page', pageId);
}

export async function deletePageCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const pageId = args.id as string;
    if (!pageId) {
        console.error('Page --id= is required.');
        process.exit(1);
    }
    const ok = await confirmDestructive(`Delete page "${pageId}".`, args);
    if (!ok) return;
    await prj.pages.delete(pageId);
    if (!args.quiet) console.log('🗑️ Deleted page', pageId);
}

cliRegistry.register('pages', { name: '', description: 'List pages', action: listPagesCommand });
cliRegistry.register('pages', {
    name: 'list',
    description: 'List pages',
    action: listPagesCommand
});
cliRegistry.register('pages', { name: 'get', description: 'Get page', action: getPageCommand });
cliRegistry.register('pages', {
    name: 'create',
    description: 'Create page',
    action: createPageCommand
});
cliRegistry.register('pages', {
    name: 'patch',
    description: 'Update page',
    action: patchPageCommand
});
cliRegistry.register('pages', {
    name: 'delete',
    description: 'Delete page',
    action: deletePageCommand
});
