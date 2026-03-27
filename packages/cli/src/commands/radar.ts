import { cliRegistry } from '../registry.js';
import { getClientOrThrow } from '../config.js';
import { projectSelectPrompt } from '../utils/projectSelectPrompt.js';

async function ensureProjectId(args: Record<string, unknown>): Promise<string> {
    const client = await getClientOrThrow();
    return (args.projectId as string) ?? (args.project as string) ?? projectSelectPrompt(client);
}

export async function reportCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const fullScan = args.fullScan === true || args.fullScan === 'true';
    const result = await client.projects.radar.get(projectId, { fullScan });
    if (args.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    console.log(JSON.stringify(result, null, 2));
}

cliRegistry.register('radar', { name: '', description: 'Get Radar report', action: reportCommand });
cliRegistry.register('radar', {
    name: 'report',
    description: 'Get Radar report',
    action: reportCommand
});
