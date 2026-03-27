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

export async function listWebhooksCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const { webhooks } = await prj.webhooks.list();
    if (args.json) {
        console.log(JSON.stringify(webhooks ?? [], null, 2));
        return;
    }
    (webhooks ?? []).forEach((w: Record<string, unknown>) => console.log(`- ${w.id} (${w.url})`));
}

export async function getWebhookCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const webhookId = args.id as string;
    if (!webhookId) {
        console.error('Use --id=<webhookId>');
        process.exit(1);
    }
    const { webhook } = await prj.webhooks.get(webhookId);
    console.log(JSON.stringify(webhook, null, 2));
}

export async function createWebhookCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const body = (await getBodyFromArgs(args)) ?? ({ url: args.url } as Record<string, unknown>);
    const { webhook } = await prj.webhooks.create(body);
    if (!args.quiet) console.log('✅ Created webhook', webhook?.id);
}

export async function patchWebhookCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const webhookId = args.id as string;
    if (!webhookId) {
        console.error(
            'Webhook --id= is required. Example: moteur webhooks patch --project=x --id=wh-1 --file=patch.json'
        );
        process.exit(1);
    }
    const patch = (await getBodyFromArgs(args)) ?? {};
    await prj.webhooks.update(webhookId, patch);
    if (!args.quiet) console.log('✅ Updated webhook', webhookId);
}

export async function deleteWebhookCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const webhookId = args.id as string;
    if (!webhookId) {
        console.error('Webhook --id= is required.');
        process.exit(1);
    }
    const ok = await confirmDestructive(`Delete webhook "${webhookId}".`, args);
    if (!ok) return;
    await prj.webhooks.delete(webhookId);
    if (!args.quiet) console.log('🗑️ Deleted webhook', webhookId);
}

export async function testWebhookCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const prj = client.forProject(projectId);
    const webhookId = args.id as string;
    if (!webhookId) {
        console.error('Use --id=<webhookId>');
        process.exit(1);
    }
    const result = await prj.webhooks.test(webhookId);
    console.log(JSON.stringify(result, null, 2));
}

cliRegistry.register('webhooks', {
    name: '',
    description: 'List webhooks',
    action: listWebhooksCommand
});
cliRegistry.register('webhooks', {
    name: 'list',
    description: 'List webhooks',
    action: listWebhooksCommand
});
cliRegistry.register('webhooks', {
    name: 'get',
    description: 'Get webhook',
    action: getWebhookCommand
});
cliRegistry.register('webhooks', {
    name: 'create',
    description: 'Create webhook',
    action: createWebhookCommand
});
cliRegistry.register('webhooks', {
    name: 'patch',
    description: 'Update webhook',
    action: patchWebhookCommand
});
cliRegistry.register('webhooks', {
    name: 'delete',
    description: 'Delete webhook',
    action: deleteWebhookCommand
});
cliRegistry.register('webhooks', {
    name: 'test',
    description: 'Test webhook',
    action: testWebhookCommand
});
