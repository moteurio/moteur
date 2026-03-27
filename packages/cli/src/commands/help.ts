import { cliRegistry } from '../registry.js';

const GLOBAL_EXAMPLES = [
    'moteur auth login',
    'moteur projects list',
    'moteur projects create --file=project.json',
    'moteur entries create --project=my-blog --model=posts --file=post.json',
    'moteur help projects'
];

const COMMAND_EXAMPLES: Record<string, string[]> = {
    auth: [
        'moteur auth login',
        'moteur auth create-user',
        'moteur auth reset-password --user=you@example.com',
        'moteur auth whoami',
        'moteur auth list --project=my-blog'
    ],
    projects: [
        'moteur projects list',
        'moteur projects get --id=my-blog',
        'moteur projects create --file=project.json',
        'moteur projects patch --id=my-blog --file=patch.json'
    ],
    models: [
        'moteur models list --project=my-blog',
        'moteur models create --project=my-blog --file=model.json'
    ],
    entries: [
        'moteur entries list --project=my-blog --model=posts',
        'moteur entries create --project=my-blog --model=posts --file=entry.json'
    ],
    templates: [
        'moteur templates list --project=my-blog',
        'moteur templates create --project=my-blog --file=template.json'
    ],
    pages: [
        'moteur pages list --project=my-blog',
        'moteur pages create --project=my-blog --file=page.json'
    ],
    assets: ['moteur assets list --project=my-blog'],
    webhooks: [
        'moteur webhooks list --project=my-blog',
        'moteur webhooks create --project=my-blog --url=https://example.com/hook'
    ],
    activity: ['moteur activity list', 'moteur logs', 'moteur tail --limit=50'],
    seed: ['moteur seed', 'moteur seed --force'],
    blueprints: [
        'moteur blueprints list --kind=project',
        'moteur blueprints get --kind=project --id=my-blueprint'
    ],
    atelier: ['moteur', 'moteur atelier'],
    ai: [
        'moteur ai generate-entry --project=my-blog --model=posts --prompt="Short news about the weather"',
        'moteur ai generate-entry --project=my-blog --model=posts --file=prompt.json --json'
    ]
};

export function showHelp(): void {
    console.log('\nUsage: moteur <command> [subcommand] [--flags]\n');
    console.log('Commands:');
    cliRegistry.listCommands().forEach(cmd => {
        const subs = cliRegistry.listSubcommands(cmd);
        if (subs.length) {
            console.log(`  ${cmd}`);
            subs.forEach(s => {
                const name = s.name || '<default>';
                console.log(`    ${name.padEnd(12)}  ${s.description ?? ''}`);
            });
        } else {
            console.log(`  ${cmd}`);
        }
    });
    console.log('\nExamples:');
    GLOBAL_EXAMPLES.forEach(ex => console.log('  ' + ex));
    console.log('\nRun `moteur` or `moteur atelier` to open Atelier (interactive TUI).');
    console.log('Run `moteur help <command>` for per-command examples.\n');
}

export function showCommandHelp(cmd: string): void {
    if (!cliRegistry.has(cmd)) {
        console.error('Unknown command:', cmd);
        showHelp();
        return;
    }
    console.log(`\nmoteur ${cmd} [subcommand] [--flags]\n`);
    const subs = cliRegistry.listSubcommands(cmd);
    subs.forEach(s => {
        const name = s.name || '<default>';
        console.log(`  ${name.padEnd(12)}  ${s.description ?? ''}`);
    });
    const examples = COMMAND_EXAMPLES[cmd];
    if (examples?.length) {
        console.log('Examples:');
        examples.forEach(ex => console.log('  ' + ex));
    }
    console.log('');
}
