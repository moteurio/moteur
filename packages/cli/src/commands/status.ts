import { cliRegistry } from '../registry.js';
import { loadConfig, getClientOrThrow, getProjectId } from '../config.js';
import chalk from 'chalk';

export async function statusCommand(args: Record<string, unknown>): Promise<void> {
    const config = await loadConfig();
    const projectId = await getProjectId(args);

    if (!projectId) {
        if (args.json) {
            console.log(JSON.stringify({ projectId: null, apiUrl: config.apiUrl }, null, 2));
            return;
        }
        console.log(
            '  No default project set. Run: moteur projects list and set default from menu.'
        );
        return;
    }

    const client = await getClientOrThrow();

    try {
        const [{ project }, { models }] = await Promise.all([
            client.projects.get(projectId),
            client.models.list(projectId)
        ]);
        const label = (project as { label?: string })?.label ?? projectId;

        if (args.json) {
            console.log(
                JSON.stringify(
                    {
                        project: projectId,
                        label,
                        apiUrl: config.apiUrl,
                        models: (models as { id?: string }[])?.length ?? 0
                    },
                    null,
                    2
                )
            );
            return;
        }

        if (args.quiet) return;

        console.log('');
        console.log(chalk.bold('PROJECT') + '   ' + label + chalk.gray('  (' + projectId + ')'));
        console.log(chalk.bold('HOST') + '      ' + (config.apiUrl ?? '—'));
        console.log('');
        console.log(chalk.bold('CONTENT'));
        const modelList = (models as { id?: string; label?: string }[]) ?? [];
        if (!modelList.length) {
            console.log('  No models yet.');
        } else {
            for (const m of modelList) {
                console.log('  ' + (m.label ?? m.id ?? '') + chalk.gray('  model: ' + m.id));
            }
        }
        console.log('');
    } catch (e) {
        if (args.json) {
            console.log(JSON.stringify({ error: (e as Error).message }, null, 2));
            process.exit(1);
        }
        throw e;
    }
}

cliRegistry.register('status', {
    name: '',
    description: 'Show project and host status',
    action: statusCommand
});
