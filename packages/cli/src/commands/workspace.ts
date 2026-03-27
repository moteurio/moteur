import { cliRegistry } from '../registry.js';

/**
 * Workspace snapshot/restore are Git-based and run on the server filesystem.
 * They are not yet exposed via REST API. Use the server admin or run from the moteur repo for local snapshot.
 */
export async function snapshotCommand(): Promise<void> {
    console.log('⚠️  Workspace snapshot is not yet available from the remote CLI.');
    console.log(
        '   Snapshot/restore require server filesystem and Git. Use the API server or run from the moteur repo.'
    );
}

export async function restoreCommand(): Promise<void> {
    console.log('⚠️  Workspace restore is not yet available from the remote CLI.');
    console.log('   Use the API server or run from the moteur repo for local restore.');
}

cliRegistry.register('workspace', {
    name: 'snapshot',
    description: 'Snapshot workspace (server endpoint not yet available)',
    action: snapshotCommand
});
cliRegistry.register('workspace', {
    name: 'restore',
    description: 'Restore workspace (server endpoint not yet available)',
    action: restoreCommand
});
cliRegistry.register('workspace', {
    name: '',
    description: 'Workspace snapshot/restore',
    action: snapshotCommand
});
