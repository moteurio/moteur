import { select, text, isCancel, cancel } from '@clack/prompts';
import { cliRegistry } from '../registry.js';
import { getClientOrThrow, getProjectId } from '../config.js';
import { projectSelectPrompt } from '../utils/projectSelectPrompt.js';
import { modelSelectPrompt } from '../utils/modelSelectPrompt.js';
import { getBodyFromArgs } from '../utils/resolveInputData.js';
import { confirmDestructive } from '../utils/confirmPrompt.js';
import { printTable } from '../utils/printTable.js';
import fs from 'fs';
import path from 'path';

export async function ensureProjectAndModel(
    args: Record<string, unknown>
): Promise<{ projectId: string; modelId: string }> {
    const client = await getClientOrThrow();
    const projectId =
        (args.projectId as string) ??
        (args.project as string) ??
        (await getProjectId(args)) ??
        (await projectSelectPrompt(client));
    const modelId = (args.modelId as string) ?? (args.model as string);
    if (!modelId) {
        const id = await modelSelectPrompt(client, projectId);
        return { projectId, modelId: id };
    }
    return { projectId, modelId };
}

/** Flatten an object into path-value pairs (one level per key for nested objects). */
function flattenPaths(
    obj: Record<string, unknown>,
    prefix = ''
): Array<{ path: string; value: unknown }> {
    const out: Array<{ path: string; value: unknown }> = [];
    for (const [k, v] of Object.entries(obj)) {
        const pathStr = prefix ? `${prefix}.${k}` : k;
        if (
            v !== null &&
            typeof v === 'object' &&
            !Array.isArray(v) &&
            Object.getPrototypeOf(v) === Object.prototype
        ) {
            out.push(...flattenPaths(v as Record<string, unknown>, pathStr));
        } else {
            out.push({ path: pathStr, value: v });
        }
    }
    return out;
}

/** Set a dotted path in obj (e.g. "data.title" => obj.data.title). */
function setAtPath(obj: Record<string, unknown>, pathStr: string, value: unknown): void {
    const parts = pathStr.split('.');
    let cur: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (!(key in cur) || typeof cur[key] !== 'object' || cur[key] === null) {
            cur[key] = {};
        }
        cur = cur[key] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = value;
}

/** Build editable paths from entry: status + data.* */
function getEditablePaths(entry: Record<string, unknown>): Array<{ path: string; value: unknown }> {
    const paths: Array<{ path: string; value: unknown }> = [];
    if (entry.status !== undefined) {
        paths.push({ path: 'status', value: entry.status });
    }
    const data = entry.data as Record<string, unknown> | undefined;
    if (data && typeof data === 'object') {
        paths.push(...flattenPaths(data, 'data'));
    }
    return paths;
}

/** Interactive prompt for each field; returns patch object. */
async function promptForFields(entry: Record<string, unknown>): Promise<Record<string, unknown>> {
    const paths = getEditablePaths(entry);
    if (paths.length === 0) {
        console.log('  No editable fields (no status or data). Use JSON edit instead.');
        return {};
    }
    const STATUS_VALUES = ['draft', 'in_review', 'published', 'unpublished'];
    const patch: Record<string, unknown> = {};
    for (const { path: pathStr, value } of paths) {
        const defaultStr = value === undefined || value === null ? '' : JSON.stringify(value);
        const isStatus = pathStr === 'status';
        if (isStatus) {
            const chosen = await select({
                message: 'Status:',
                options: STATUS_VALUES.map(v => ({ value: v, label: v }))
            });
            if (isCancel(chosen)) {
                cancel('Cancelled.');
                process.exit(0);
            }
            setAtPath(patch, pathStr, chosen);
        } else {
            const res = await text({
                message: `${pathStr}:`,
                initialValue: defaultStr
            });
            if (isCancel(res)) {
                cancel('Cancelled.');
                process.exit(0);
            }
            const raw = res?.trim();
            if (raw === '' || raw === defaultStr) continue; // unchanged
            try {
                const parsed = JSON.parse(raw);
                setAtPath(patch, pathStr, parsed);
            } catch {
                setAtPath(patch, pathStr, raw);
            }
        }
    }
    return patch;
}

/** Parse patch from file path or inline JSON string. */
async function parsePatchInput(input: string): Promise<Record<string, unknown>> {
    const trimmed = input.trim();
    if (!trimmed) throw new Error('No input.');
    if (trimmed.startsWith('{')) {
        try {
            return JSON.parse(trimmed) as Record<string, unknown>;
        } catch (e) {
            throw new Error('Invalid JSON: ' + (e instanceof Error ? e.message : String(e)));
        }
    }
    const filePath = path.resolve(trimmed);
    if (!fs.existsSync(filePath)) throw new Error('File not found: ' + trimmed);
    const raw = fs.readFileSync(filePath, 'utf-8');
    try {
        return JSON.parse(raw) as Record<string, unknown>;
    } catch (e) {
        throw new Error('Invalid JSON in file: ' + (e instanceof Error ? e.message : String(e)));
    }
}

export async function listEntriesCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const { projectId, modelId } = await ensureProjectAndModel(args);
    const { entries } = await client.entries.list(projectId, modelId, {
        status: args.status as string,
        limit: args.limit as number
    });
    if (args.json) {
        console.log(JSON.stringify(entries ?? [], null, 2));
        return;
    }
    const list = entries ?? [];
    if (!args.quiet) {
        const cols = [{ key: 'id', header: 'id' }];
        const hasStatus = list.some(e => e.status != null);
        const hasUpdated = list.some(e => (e as { updatedAt?: unknown }).updatedAt != null);
        if (hasStatus) cols.push({ key: 'status', header: 'status' });
        if (hasUpdated) cols.push({ key: 'updatedAt', header: 'updatedAt' });
        printTable(cols, list as unknown as Record<string, unknown>[]);
    }

    const fromMenu = args.fromMenu === true;
    if (fromMenu && list.length > 0) {
        await entrySelectAndDetailLoop(
            client,
            projectId,
            modelId,
            list as unknown as Record<string, unknown>[]
        );
    }
}

async function entrySelectAndDetailLoop(
    client: Awaited<ReturnType<typeof getClientOrThrow>>,
    projectId: string,
    modelId: string,
    list: Record<string, unknown>[]
): Promise<void> {
    const selectedId = await select({
        message: 'Select an entry to view or edit:',
        options: [
            ...list.map(e => ({
                value: String(e.id),
                label: `${String(e.id)}${e.status ? ` (${e.status})` : ''}`
            })),
            { value: '__back__', label: 'Back to menu' }
        ]
    });
    if (isCancel(selectedId)) return;
    if (selectedId === '__back__') return;

    let entry: Record<string, unknown>;
    try {
        const res = await client.entries.get(projectId, modelId, selectedId);
        entry = (res.entry ?? res) as unknown as Record<string, unknown>;
    } catch (e) {
        console.error('  ', e instanceof Error ? e.message : String(e));
        return;
    }

    const showDetails = (): void => {
        console.log('\n' + JSON.stringify(entry, null, 2) + '\n');
    };

    for (;;) {
        showDetails();
        const action = await select({
            message: 'What do you want to do?',
            options: [
                { value: 'view', label: 'View details again' },
                { value: 'edit', label: 'Edit entry (patch with JSON or file path)' },
                { value: 'back-list', label: 'Back to entry list' },
                { value: 'back-menu', label: 'Back to menu' }
            ]
        });
        if (isCancel(action)) return;
        if (action === 'view') continue;
        if (action === 'back-menu') return;
        if (action === 'back-list') {
            const { entries: listAgain } = await client.entries.list(projectId, modelId, {});
            const list2 = (listAgain ?? []) as unknown as Record<string, unknown>[];
            if (list2.length > 0) {
                await entrySelectAndDetailLoop(client, projectId, modelId, list2);
            }
            return;
        }
        if (action === 'edit') {
            const editMode = await select({
                message: 'How do you want to edit?',
                options: [
                    {
                        value: 'fields',
                        label: 'Field by field (interactive prompts for each field)'
                    },
                    { value: 'json', label: 'Paste JSON or path to JSON file' }
                ]
            });
            if (isCancel(editMode)) continue;
            try {
                let patch: Record<string, unknown>;
                if (editMode === 'fields') {
                    patch = await promptForFields(entry);
                    if (Object.keys(patch).length === 0) continue;
                } else {
                    const patchInput = await text({
                        message: 'Path to JSON file or paste JSON (e.g. {"data":{"title":"New"}}):'
                    });
                    if (isCancel(patchInput)) continue;
                    patch = await parsePatchInput(patchInput);
                }
                await client.entries.update(projectId, modelId, selectedId, patch);
                console.log('  ✅ Updated entry', selectedId);
                const res = await client.entries.get(projectId, modelId, selectedId);
                entry = (res.entry ?? res) as unknown as Record<string, unknown>;
            } catch (e) {
                console.error('  ', e instanceof Error ? e.message : String(e));
            }
        }
    }
}

export async function getEntryCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const { projectId, modelId } = await ensureProjectAndModel(args);
    const entryId = args.id as string;
    if (!entryId) {
        console.error('Use --id=<entryId>');
        process.exit(1);
    }
    const { entry } = await client.entries.get(projectId, modelId, entryId);
    if (args.json) {
        console.log(JSON.stringify(entry, null, 2));
        return;
    }
    if (!args.quiet) console.log(JSON.stringify(entry, null, 2));
}

export async function createEntryCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const { projectId, modelId } = await ensureProjectAndModel(args);
    const body = (await getBodyFromArgs(args)) ?? {};
    const { entry } = await client.entries.create(projectId, modelId, body);
    if (args.json) {
        console.log(JSON.stringify(entry, null, 2));
        return;
    }
    if (!args.quiet) console.log('✅ Created entry', entry?.id);
}

export async function patchEntryCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const { projectId, modelId } = await ensureProjectAndModel(args);
    const entryId = args.id as string;
    if (!entryId) {
        console.error(
            'Entry --id= is required. Example: moteur entries patch --project=x --model=y --id=entry-1 --file=patch.json'
        );
        process.exit(1);
    }
    const patch = (await getBodyFromArgs(args)) ?? {};
    await client.entries.update(projectId, modelId, entryId, patch);
    if (!args.quiet) console.log('✅ Updated entry', entryId);
}

export async function deleteEntryCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const { projectId, modelId } = await ensureProjectAndModel(args);
    const entryId = args.id as string;
    if (!entryId) {
        console.error(
            'Entry --id= is required. Example: moteur entries delete --project=x --model=y --id=entry-1'
        );
        process.exit(1);
    }
    const ok = await confirmDestructive(`Delete entry "${entryId}".`, args);
    if (!ok) return;
    await client.entries.delete(projectId, modelId, entryId);
    if (!args.quiet) console.log('🗑️ Deleted entry', entryId);
}

cliRegistry.register('entries', {
    name: '',
    description: 'List entries',
    action: listEntriesCommand
});
cliRegistry.register('entries', {
    name: 'list',
    description: 'List entries',
    action: listEntriesCommand
});
cliRegistry.register('entries', {
    name: 'get',
    description: 'Get one entry',
    action: getEntryCommand
});
cliRegistry.register('entries', {
    name: 'create',
    description: 'Create an entry',
    action: createEntryCommand
});
cliRegistry.register('entries', {
    name: 'patch',
    description: 'Update an entry',
    action: patchEntryCommand
});
cliRegistry.register('entries', {
    name: 'delete',
    description: 'Delete an entry',
    action: deleteEntryCommand
});
