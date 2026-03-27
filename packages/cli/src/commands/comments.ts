import { cliRegistry } from '../registry.js';
import { getClientOrThrow } from '../config.js';
import { projectSelectPrompt } from '../utils/projectSelectPrompt.js';

async function ensureProjectId(args: Record<string, unknown>): Promise<string> {
    const client = await getClientOrThrow();
    return (args.projectId as string) ?? (args.project as string) ?? projectSelectPrompt(client);
}

export async function listCommentsCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const resourceType = args.resourceType as string;
    const resourceId = args.resourceId as string;
    if (!resourceType || !resourceId) {
        console.error('Use --resourceType=entry|layout --resourceId=<id>');
        process.exit(1);
    }
    const { comments } = await client.projects.comments.list(projectId, {
        resourceType,
        resourceId,
        includeResolved: args.includeResolved === true || args.includeResolved === 'true',
        fieldPath: args.fieldPath as string
    });
    if (args.json) {
        console.log(JSON.stringify(comments ?? [], null, 2));
        return;
    }
    (comments ?? []).forEach(c => console.log(`- ${c.id}: ${c.body}`));
}

export async function addCommentCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const body = args.body as string;
    const resourceType = args.resourceType as string;
    const resourceId = args.resourceId as string;
    if (!body || !resourceType || !resourceId) {
        console.error('Use --resourceType= --resourceId= --body=');
        process.exit(1);
    }
    const { comment } = await client.projects.comments.add(projectId, {
        resourceType,
        resourceId,
        body,
        fieldPath: args.fieldPath as string,
        blockId: args.blockId as string,
        parentId: args.parentId as string
    });
    if (!args.quiet) console.log('✅ Comment added', comment?.id);
}

export async function resolveCommentCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const commentId = args.id as string;
    if (!commentId) {
        console.error('Use --id=<commentId>');
        process.exit(1);
    }
    await client.projects.comments.resolve(projectId, commentId);
    if (!args.quiet) console.log('✅ Comment resolved');
}

export async function deleteCommentCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const commentId = args.id as string;
    if (!commentId) {
        console.error('Use --id=<commentId>');
        process.exit(1);
    }
    await client.projects.comments.delete(projectId, commentId);
    if (!args.quiet) console.log('🗑️ Deleted comment');
}

cliRegistry.register('comments', {
    name: '',
    description: 'List comments',
    action: listCommentsCommand
});
cliRegistry.register('comments', {
    name: 'list',
    description: 'List comments',
    action: listCommentsCommand
});
cliRegistry.register('comments', {
    name: 'add',
    description: 'Add comment',
    action: addCommentCommand
});
cliRegistry.register('comments', {
    name: 'resolve',
    description: 'Resolve comment',
    action: resolveCommentCommand
});
cliRegistry.register('comments', {
    name: 'delete',
    description: 'Delete comment',
    action: deleteCommentCommand
});
