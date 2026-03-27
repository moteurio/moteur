import { select, isCancel, cancel } from '@clack/prompts';

/** Minimal shape for any client returned by createMoteurAdminClient (typed project list). */
type ClientWithProjects = {
    projects: {
        list(): Promise<{ projects: Array<{ id?: string; label?: string }> }>;
    };
};

export async function projectSelectPrompt(client: ClientWithProjects): Promise<string> {
    const { projects } = await client.projects.list();
    if (!projects?.length) {
        throw new Error('No projects available. Create a project first or check your credentials.');
    }
    const selected = await select({
        message: 'Select a project:',
        options: projects.map(p => ({
            value: String(p.id),
            label: `${String(p.label ?? p.id)} (${p.id})`
        }))
    });
    if (isCancel(selected)) {
        cancel('Cancelled.');
        process.exit(0);
    }
    return selected as string;
}
