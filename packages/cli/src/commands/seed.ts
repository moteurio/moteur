import { cliRegistry } from '../registry.js';
import { getClientOrThrow } from '../config.js';

export async function seedCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const force = args.force === true || args.force === 'true';
    const result = await client.instance.seed.run({ force });
    if (args.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    if (!args.quiet) {
        if (result.copied?.length) {
            console.log('Seeded blueprints:');
            result.copied.forEach(f => console.log('  +', f));
        }
        if (result.skipped?.length) {
            console.log('Skipped (use --force to overwrite):');
            result.skipped.forEach(f => console.log('  -', f));
        }
        if (!result.copied?.length && !result.skipped?.length) {
            console.log('No seed files found under data/seeds/blueprints/ on the server.');
        }
    }
}

cliRegistry.register('seed', {
    name: '',
    description: 'Run seed on server (copy blueprint seeds to blueprints dir)',
    action: seedCommand
});
