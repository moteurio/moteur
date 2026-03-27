import { select, isCancel, cancel } from '@clack/prompts';

type ClientWithModels = {
    models: {
        list(projectId: string): Promise<{ models: Array<{ id?: string; label?: string }> }>;
    };
};

export async function modelSelectPrompt(
    client: ClientWithModels,
    projectId: string
): Promise<string> {
    const { models } = await client.models.list(projectId);
    if (!models?.length) {
        throw new Error(
            'No models in this project. Create a model first: moteur models create --project=' +
                projectId
        );
    }
    const selected = await select({
        message: 'Select a model:',
        options: models.map(m => ({
            value: String(m.id),
            label: `${String(m.label ?? m.id)} (${m.id})`
        }))
    });
    if (isCancel(selected)) {
        cancel('Cancelled.');
        process.exit(0);
    }
    return selected as string;
}
