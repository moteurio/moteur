/** Running a declared command from the command line: words → arguments → the call → output. */
import { confirm, isCancel } from '@clack/prompts';
import {
    BODY_ARGS,
    UsageError,
    checkArgs,
    coerce,
    configSession,
    execute,
    type ArgSpec,
    type CommandSpec
} from '@moteurio/commands';
import { resolveInputData } from '../utils/resolveInputData.js';
import { formatError } from '../utils/formatMessage.js';
import { BOOLEAN_FLAGS, kebab, parseArgv } from './argv.js';
import { printResult } from './output.js';

/** Flags every command takes on the command line. */
export const GLOBAL_ARGS: ArgSpec[] = [
    { name: 'json', type: 'boolean', description: 'Print the result as JSON (for scripts)' },
    { name: 'quiet', type: 'boolean', description: 'Print nothing but errors' },
    {
        name: 'yes',
        type: 'boolean',
        description: 'Don’t ask before changes that can’t be undone',
        aliases: ['force']
    },
    { name: 'plain', type: 'boolean', description: 'No colour', aliases: ['no-color'] },
    { name: 'debug', type: 'boolean', description: 'Show the requests and full errors' },
    { name: 'help', type: 'boolean', description: 'Show this help' }
];

/** Every argument a command takes here: its own, --file/--data for a JSON body, the global ones. */
export function argsOf(command: CommandSpec): ArgSpec[] {
    return [...(command.args ?? []), ...(command.body === 'json' ? BODY_ARGS : []), ...GLOBAL_ARGS];
}

/** The command's arguments from the command line: options by name, words by position. */
export function readArgs(command: CommandSpec, argv: string[]): Record<string, unknown> {
    const specs = argsOf(command);
    const booleans = new Set([
        ...BOOLEAN_FLAGS,
        ...specs.filter(a => a.type === 'boolean').map(a => a.name)
    ]);
    const { words, flags } = parseArgv(argv, booleans);
    const values: Record<string, unknown> = { ...flags };
    const positionals = specs
        .filter(a => a.positional !== undefined)
        .sort((a, b) => a.positional! - b.positional!);
    for (let i = 0; i < words.length; i++) {
        const arg = positionals[i];
        if (!arg) throw new UsageError(`Unexpected "${words[i]}"`);
        // A list takes every word left: `moteur media upload a.jpg b.jpg`.
        if (arg.type === 'list') {
            values[arg.name] = coerce(arg, words.slice(i));
            break;
        }
        values[arg.name] ??= words[i];
    }
    return checkArgs(specs, values, { normalize: kebab });
}

async function confirmFirst(command: CommandSpec, args: Record<string, unknown>): Promise<boolean> {
    if (!command.destructive || args.yes) return true;
    if (!process.stdin.isTTY) {
        throw new UsageError(
            `This can’t be undone. Add --yes to run "${command.group} ${command.name}" without asking.`
        );
    }
    const what = [
        command.group,
        command.name,
        ...Object.values(args).filter(v => typeof v === 'string')
    ].join(' ');
    const ok = await confirm({ message: `${command.summary}: ${what}?`, initialValue: false });
    return !isCancel(ok) && ok === true;
}

/** Runs one command from the words after `moteur`; returns the exit code. */
export async function runCommand(command: CommandSpec, argv: string[]): Promise<number> {
    let args: Record<string, unknown> = {};
    try {
        args = readArgs(command, argv);
        if (!(await confirmFirst(command, args))) {
            if (!args.quiet) console.error('Nothing changed.');
            return 1;
        }
        const session = configSession({
            body: () =>
                resolveInputData({
                    file: args.file as string | undefined,
                    data: args.data as string | undefined,
                    stdin: true,
                    allowEmpty: true
                }),
            say: message => {
                if (!args.quiet && !args.json) console.log(message);
            },
            debug: args.debug === true
        });
        printResult(command, await execute(command, args, session), args);
        return 0;
    } catch (err) {
        if (err instanceof UsageError) {
            console.error(`✗ ${err.message}`);
            console.error(
                `  See: moteur ${command.group}${command.name ? ` ${command.name}` : ''} --help`
            );
            return 2;
        }
        console.error(formatError(err));
        if (args.debug) console.error(err);
        return 1;
    }
}
