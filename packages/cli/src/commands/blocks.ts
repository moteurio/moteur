import { cliRegistry } from '../registry.js';
import { getClientOrThrow } from '../config.js';
import { projectSelectPrompt } from '../utils/projectSelectPrompt.js';

async function ensureProjectId(args: Record<string, unknown>): Promise<string> {
    const client = await getClientOrThrow();
    return (args.projectId as string) ?? (args.project as string) ?? projectSelectPrompt(client);
}

export async function listBlocksCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const blocks = await client.forProject(projectId).blocks.list();
    if (args.json) {
        console.log(JSON.stringify(blocks ?? {}, null, 2));
        return;
    }
    const map = blocks && typeof blocks === 'object' ? (blocks as Record<string, unknown>) : {};
    Object.keys(map).forEach(id => console.log(`- ${id}`));
}

cliRegistry.register('blocks', {
    name: '',
    description: 'List block types',
    action: listBlocksCommand
});
cliRegistry.register('blocks', {
    name: 'list',
    description: 'List block types',
    action: listBlocksCommand
});
