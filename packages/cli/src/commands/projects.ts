import { text, confirm, isCancel, cancel } from '@clack/prompts';
import { cliRegistry } from '../registry.js';
import { getClientOrThrow, getProjectId } from '../config.js';
import { projectSelectPrompt } from '../utils/projectSelectPrompt.js';
import { resolveInputData, getBodyFromArgs } from '../utils/resolveInputData.js';
import { confirmDestructive } from '../utils/confirmPrompt.js';
import { printTable } from '../utils/printTable.js';

async function ensureProjectId(args: Record<string, unknown>): Promise<string> {
    const client = await getClientOrThrow();
    const projectId =
        (args.projectId as string) ??
        (args.project as string) ??
        (args.id as string) ??
        (await getProjectId(args));
    if (projectId) return projectId;
    return projectSelectPrompt(client);
}

export async function listProjectsCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const { projects } = await client.projects.list();
    if (!projects?.length) {
        if (!args.quiet) console.log('📂 No projects found.');
        return;
    }
    if (args.json) {
        console.log(JSON.stringify(projects, null, 2));
        return;
    }
    if (!args.quiet) {
        printTable(
            [
                { key: 'id', header: 'id' },
                { key: 'label', header: 'label' }
            ],
            projects as unknown as Record<string, unknown>[]
        );
    }
}

export async function getProjectCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const { project } = await client.projects.get(projectId);
    if (args.json) {
        console.log(JSON.stringify(project, null, 2));
        return;
    }
    if (!args.quiet) console.log('📁 Project:', JSON.stringify(project, null, 2));
}

export async function createProjectCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    let body = await getBodyFromArgs(args);
    if (!body || Object.keys(body).length === 0) {
        body = { id: args.id, label: (args.label ?? args.id) as string };
    }
    if (!body.id && !body.label) {
        const idVal = await text({
            message: 'Project ID:',
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
    const { project } = await client.projects.create(body);
    const id = project?.id as string | undefined;
    if (args.json) {
        console.log(JSON.stringify(project, null, 2));
        return;
    }
    if (!args.quiet)
        console.log(
            '✅ Created project',
            id,
            '\n  View it: moteur projects get --id=' + (id ?? '')
        );
    if (args.fromMenu && id) {
        const { loadConfig, saveConfig } = await import('../config.js');
        const setAsDefault = await confirm({
            message: 'Use this project as your default?',
            initialValue: true
        });
        if (isCancel(setAsDefault)) return;
        if (setAsDefault) {
            const cfg = await loadConfig();
            await saveConfig({ ...cfg, projectId: id });
            console.log('  Default project set to:', id);
        }
    }
}

export async function patchProjectCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const hasInput = args.file || args.data || (!process.stdin.isTTY && args.stdin !== false);
    let patch: Record<string, unknown>;
    if (hasInput) {
        try {
            patch = await resolveInputData({
                file: args.file as string,
                data: args.data as string,
                stdin: true,
                allowEmpty: true
            });
        } catch (e) {
            console.error(e instanceof Error ? e.message : String(e));
            process.exit(1);
        }
    } else {
        patch = { label: args.label } as Record<string, unknown>;
    }
    if (Object.keys(patch).length === 0) {
        console.error(
            'Provide --file=path, --data=\'{"label":"..."}\', or --label=x. Example: moteur projects patch --id=my-blog --file=patch.json'
        );
        process.exit(1);
    }
    await client.projects.update(projectId, patch);
    if (!args.quiet) console.log('✅ Updated project', projectId);
}

export async function deleteProjectCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await ensureProjectId(args);
    const ok = await confirmDestructive(`Delete project "${projectId}".`, args);
    if (!ok) return;
    await client.projects.delete(projectId);
    if (!args.quiet)
        console.log('🗑️ Deleted project', projectId, '\n  List projects: moteur projects list');
}

cliRegistry.register('projects', {
    name: '',
    description: 'Projects menu',
    action: listProjectsCommand
});
cliRegistry.register('projects', {
    name: 'list',
    description: 'List all projects',
    action: listProjectsCommand
});
cliRegistry.register('projects', {
    name: 'get',
    description: 'Get one project',
    action: getProjectCommand
});
cliRegistry.register('projects', {
    name: 'create',
    description: 'Create a project',
    action: createProjectCommand
});
cliRegistry.register('projects', {
    name: 'patch',
    description: 'Update a project',
    action: patchProjectCommand
});
cliRegistry.register('projects', {
    name: 'delete',
    description: 'Delete a project',
    action: deleteProjectCommand
});
