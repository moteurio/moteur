import { cliRegistry } from '../registry.js';
import { getClientOrThrow } from '../config.js';
import { ensureProjectAndModel } from './entries.js';
import { getBodyFromArgs } from '../utils/resolveInputData.js';

function pickPrompt(args: Record<string, unknown>): string | undefined {
    const p = args.prompt;
    if (typeof p === 'string' && p.trim()) return p.trim();
    return undefined;
}

function pickLocale(
    args: Record<string, unknown>,
    fromBody: Record<string, unknown>
): string | undefined {
    const a = args.locale ?? args['locale'];
    if (typeof a === 'string' && a.trim()) return a.trim();
    const b = fromBody.locale;
    if (typeof b === 'string' && b.trim()) return b.trim();
    return undefined;
}

export async function generateEntryCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const { projectId, modelId } = await ensureProjectAndModel(args);

    const fromFile = (await getBodyFromArgs(args)) ?? {};
    const prompt =
        pickPrompt(args) ?? (typeof fromFile.prompt === 'string' ? fromFile.prompt.trim() : '');
    if (!prompt) {
        console.error(
            'Provide --prompt="..." or JSON with "prompt" via --file, --data, or stdin.\n' +
                'Example: moteur ai generate-entry --project=my-blog --model=posts --prompt="A post about tides"'
        );
        process.exit(1);
    }

    const locale = pickLocale(args, fromFile);

    const result = await client.ai.generateEntry({
        projectId,
        modelId,
        prompt,
        ...(locale ? { locale } : {})
    });

    if (args.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    if (!args.quiet) {
        console.log(JSON.stringify(result.entry, null, 2));
        if (typeof result.creditsRemaining === 'number') {
            console.error(
                `Credits remaining: ${result.creditsRemaining} (used ${result.creditsUsed})`
            );
        }
    }
}

cliRegistry.register('ai', {
    name: 'generate-entry',
    description: 'Generate a draft entry with AI (JWT required)',
    action: generateEntryCommand
});
