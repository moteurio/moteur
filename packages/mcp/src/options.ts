import { API_COMMANDS } from '@moteurio/commands';
import type { ServerOptions } from './server.js';

/** `moteur-mcp` options: --read-only, --allow-destructive, --groups a,b, --all, --compact, --project. */
export function parseOptions(
    argv: string[]
): ServerOptions & { help?: boolean; list?: boolean; version?: boolean } {
    const value = (flag: string) => {
        const at = argv.findIndex(a => a === flag || a.startsWith(`${flag}=`));
        if (at < 0) return undefined;
        return argv[at].includes('=') ? argv[at].split('=').slice(1).join('=') : argv[at + 1];
    };
    const has = (flag: string) => argv.includes(flag);
    const groups = value('--groups')
        ?.split(',')
        .map(g => g.trim())
        .filter(Boolean);
    const all = has('--all');
    return {
        readOnly: has('--read-only'),
        allowDestructive: has('--allow-destructive'),
        allowPublish: has('--allow-publish'),
        agentName: value('--agent-name'),
        compact: has('--compact'),
        groups: all ? [...new Set(API_COMMANDS.map(c => c.group))] : groups,
        project: value('--project'),
        help: has('--help') || has('-h'),
        list: has('--list'),
        version: has('--version')
    };
}
