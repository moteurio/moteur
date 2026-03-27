import { cliRegistry } from '../registry.js';
import { getClientOrThrow } from '../config.js';
import { projectSelectPrompt } from '../utils/projectSelectPrompt.js';

async function ensureProjectId(args: Record<string, unknown>): Promise<string> {
    const client = await getClientOrThrow();
    return (args.projectId as string) ?? (args.project as string) ?? projectSelectPrompt(client);
}

export async function listBranchesCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const { branches, current } = await client.projects.branches.list(projectId);
    if (args.json) {
        console.log(JSON.stringify({ branches, current }, null, 2));
        return;
    }
    console.log('Branches:', branches?.join(', ') ?? 'none');
    if (current) console.log('Current:', current);
}

export async function createBranchCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const name = args.name as string;
    if (!name) {
        console.error('Use --name=<branchName>');
        process.exit(1);
    }
    await client.projects.branches.create(projectId, name, args.from as string);
    if (!args.quiet) console.log('✅ Created branch', name);
}

export async function switchBranchCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const branch = args.branch as string;
    if (!branch) {
        console.error('Use --branch=<name>');
        process.exit(1);
    }
    await client.projects.branches.switch(projectId, branch);
    if (!args.quiet) console.log('✅ Switched to branch', branch);
}

export async function mergeBranchCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const sourceBranch = (args.sourceBranch as string) ?? (args.source as string);
    if (!sourceBranch) {
        console.error('Use --sourceBranch=<name>');
        process.exit(1);
    }
    await client.projects.branches.merge(projectId, sourceBranch);
    if (!args.quiet) console.log('✅ Merged', sourceBranch);
}

cliRegistry.register('branches', {
    name: '',
    description: 'List branches',
    action: listBranchesCommand
});
cliRegistry.register('branches', {
    name: 'list',
    description: 'List branches',
    action: listBranchesCommand
});
cliRegistry.register('branches', {
    name: 'create',
    description: 'Create branch (--name=)',
    action: createBranchCommand
});
cliRegistry.register('branches', {
    name: 'switch',
    description: 'Switch branch (--branch=)',
    action: switchBranchCommand
});
cliRegistry.register('branches', {
    name: 'merge',
    description: 'Merge branch (--sourceBranch=)',
    action: mergeBranchCommand
});
