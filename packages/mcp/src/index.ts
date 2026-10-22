/** `moteur-mcp`: the MCP server over stdio, for Claude and other MCP clients. */
import { createRequire } from 'module';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { API_COMMANDS } from '@moteurio/commands';
import { createServer } from './server.js';
import { parseOptions } from './options.js';
import { OPT_IN_GROUPS, selectCommands, toolName } from './tools.js';

const HELP = `moteur-mcp: Moteur for AI agents (Model Context Protocol, over stdio)

  moteur-mcp                       a tool per command (reads and ordinary changes)
  moteur-mcp --read-only           reading tools only
  moteur-mcp --allow-destructive   also tools that can't be undone (delete, purge, merge…)
  moteur-mcp --groups entries,media,reviews   only these groups (see --list)
  moteur-mcp --all                 every group, operator and billing included
  moteur-mcp --compact             three tools that find, describe and run any command
  moteur-mcp --project <id>        the project when a call names none
  moteur-mcp --allow-publish       changes may go live without a person approving them
  moteur-mcp --agent-name <name>   who changes are marked as made by (default: the client's name)
  moteur-mcp --list                print the tools and exit

Acts for you as an agent: changes read "<you> via <agent>" and are marked until someone reads
them; by default they go live only once a person approves them (reviews) or publishes them.

Signs in like the moteur CLI: ~/.moteur/config.json (moteur auth login), or MOTEUR_API_URL with
MOTEUR_TOKEN or MOTEUR_API_KEY. Default project: --project, MOTEUR_PROJECT, or moteur projects use.
Opt-in groups: ${OPT_IN_GROUPS.join(', ')} (with --groups or --all).
`;

const options = parseOptions(process.argv.slice(2));
if (options.help) {
    process.stdout.write(HELP);
} else if (options.version) {
    process.stdout.write(
        `${(createRequire(import.meta.url)('../package.json') as { version: string }).version}\n`
    );
} else if (options.list) {
    const tools = selectCommands(API_COMMANDS, options);
    for (const c of tools) process.stdout.write(`${toolName(c).padEnd(32)}${c.summary}\n`);
    process.stdout.write(`\n${tools.length} tools.\n`);
} else {
    const server = createServer(options);
    await server.connect(new StdioServerTransport());
}
