import { cliRegistry } from '../registry.js';

/**
 * Field types are part of the server registry. Use the API docs or admin to list.
 */
export async function listFieldsCommand(args: Record<string, unknown>): Promise<void> {
    console.log('Field types are defined by the server. Use the API /docs or admin UI to inspect.');
    if (args.json) {
        console.log(JSON.stringify({ message: 'Use API docs for field types' }, null, 2));
    }
}

cliRegistry.register('fields', {
    name: '',
    description: 'List field types (see API docs)',
    action: listFieldsCommand
});
cliRegistry.register('fields', {
    name: 'list',
    description: 'List field types',
    action: listFieldsCommand
});
