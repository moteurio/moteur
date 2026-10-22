/* global FormData, Blob */
/** The media library and where its files live. */
import fs from 'fs';
import path from 'path';
import { group, id, project, type ArgSpec } from '../spec.js';
import { localized } from '../format.js';

const P = '/projects/{project}';
const assetArg: ArgSpec = { ...id('File'), positional: 0 };

const TYPES: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    glb: 'model/gltf-binary',
    gltf: 'model/gltf+json'
};

/** A file from disk as a multipart form, with optional fields. */
function fileForm(file: string, fields: Record<string, unknown> = {}): FormData {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`No file at ${file}`);
    const name = path.basename(file);
    const type = TYPES[path.extname(name).slice(1).toLowerCase()] ?? 'application/octet-stream';
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(file)], { type }), name);
    for (const [k, v] of Object.entries(fields))
        if (v !== undefined) form.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    return form;
}

/** `--alt "…"` for one language (--lang) or as a plain text. */
const textArgs: ArgSpec[] = [
    { name: 'alt', description: 'Alt text: what the picture shows', in: 'none' },
    { name: 'title', description: 'Title', in: 'none' },
    { name: 'caption', description: 'Caption', in: 'none' },
    { name: 'credit', description: 'Credit', in: 'none' },
    {
        name: 'lang',
        description: 'The language of --alt, --title and --caption (keeps the others)',
        in: 'none'
    }
];

export const media = group('media', [
    {
        name: 'list',
        summary: 'Files in the library, newest first',
        args: [
            project,
            {
                name: 'kind',
                description: 'image, video, audio, model, document, or unused',
                in: 'query',
                key: 'type'
            },
            { name: 'folder', description: 'Only this folder ("" for none)', in: 'query' },
            {
                name: 'search',
                description: 'Words in names, titles, alt text',
                in: 'query',
                aliases: ['q']
            },
            { name: 'hash', description: 'Files with this content hash (duplicates)', in: 'query' },
            {
                name: 'facets',
                type: 'boolean',
                description: 'Also count files by kind and list folders',
                in: 'query'
            },
            {
                name: 'limit',
                type: 'number',
                description: 'How many (1–500)',
                default: 50,
                in: 'query'
            },
            { name: 'offset', type: 'number', description: 'How many to skip', in: 'query' }
        ],
        http: `GET ${P}/assets`,
        pick: 'assets',
        table: [
            { key: 'id', header: 'id' },
            { key: 'filename', header: 'file' },
            { key: 'type', header: 'kind' },
            { key: 'folder', header: 'folder' },
            { key: 'alt', header: 'alt', format: localized }
        ],
        readOnly: true
    },
    {
        name: 'get',
        summary: 'Show one file',
        args: [project, assetArg],
        http: `GET ${P}/assets/{id}`,
        readOnly: true
    },
    {
        name: 'upload',
        summary: 'Add files to the library',
        args: [
            project,
            {
                name: 'files',
                type: 'list',
                description: 'Paths of the files',
                required: true,
                positional: 0,
                in: 'none'
            },
            { name: 'folder', description: 'Put them in this folder', in: 'none' },
            ...textArgs.filter(a => a.name !== 'lang')
        ],
        run: async ctx => {
            const client = await ctx.client();
            const projectId = await ctx.project();
            const added = [];
            for (const file of ctx.args.files as string[]) {
                const asset = await client.assets.upload(
                    projectId,
                    fileForm(file, {
                        folder: ctx.args.folder,
                        alt: ctx.args.alt,
                        title: ctx.args.title,
                        credit: ctx.args.credit
                    })
                );
                ctx.say(`Added ${path.basename(file)} (${(asset as { id?: string }).id ?? ''}).`);
                added.push(asset);
            }
            return added;
        },
        covers: [`POST ${P}/assets`],
        done: r => `${(r as unknown[]).length} file(s) added.`,
        examples: ['moteur media upload photos/*.jpg --folder covers']
    },
    {
        name: 'update',
        summary: 'Change a file’s alt text, title, caption, credit or focal point',
        args: [
            project,
            assetArg,
            ...textArgs,
            {
                name: 'focal',
                description: 'Focal point as x,y between 0 and 1 (0.5,0.4)',
                in: 'none'
            }
        ],
        run: async ctx => {
            const client = await ctx.client();
            const projectId = await ctx.project();
            const assetId = String(ctx.args.id);
            const current = (await client.assets.get(projectId, assetId)) as Record<
                string,
                unknown
            >;
            const patch: Record<string, unknown> = {};
            for (const key of ['alt', 'title', 'caption'] as const) {
                const value = ctx.args[key];
                if (value === undefined) continue;
                const lang = ctx.args.lang as string | undefined;
                if (!lang) patch[key] = value || null;
                else {
                    const prev = current[key];
                    const map =
                        typeof prev === 'string'
                            ? {}
                            : { ...((prev as Record<string, string>) ?? {}) };
                    if (value) map[lang] = String(value);
                    else delete map[lang];
                    patch[key] = Object.keys(map).length ? map : null;
                }
            }
            if (ctx.args.credit !== undefined) patch.credit = ctx.args.credit || null;
            if (ctx.args.focal) {
                const [x, y] = String(ctx.args.focal).split(',').map(Number);
                patch.focalPoint = { x, y };
            }
            if (!Object.keys(patch).length)
                throw new Error(
                    'Nothing to change: --alt, --title, --caption, --credit or --focal'
                );
            return client.assets.update(projectId, assetId, patch);
        },
        covers: [`PATCH ${P}/assets/{id}`],
        done: (_r, a) => `Saved ${a.id}.`,
        examples: ['moteur media update mprq-123 --alt "Under the ice" --lang en']
    },
    {
        name: 'move',
        summary: 'Put a file in a folder ("" for none)',
        args: [
            project,
            assetArg,
            { name: 'folder', description: 'The folder', required: true, positional: 1, in: 'body' }
        ],
        http: `POST ${P}/assets/{id}/move`,
        done: (_r, a) => `Moved to ${a.folder || 'no folder'}.`
    },
    {
        name: 'replace',
        summary: 'Swap a file for another of the same kind, keeping its id and uses',
        args: [
            project,
            assetArg,
            {
                name: 'file',
                description: 'Path of the new file',
                required: true,
                positional: 1,
                in: 'none'
            }
        ],
        run: async ctx => {
            const client = await ctx.client();
            return client.assets.replace(
                await ctx.project(),
                String(ctx.args.id),
                fileForm(String(ctx.args.file))
            );
        },
        covers: [`POST ${P}/assets/{id}/replace`],
        done: (_r, a) => `Replaced ${a.id}.`
    },
    {
        name: 'delete',
        summary: 'Put a file in the bin (it can come back)',
        args: [project, assetArg],
        http: `DELETE ${P}/assets/{id}`,
        done: (_r, a) => `${a.id} is in the bin. Take it out: moteur media restore ${a.id}`
    },
    {
        name: 'bin',
        summary: 'Files in the bin',
        args: [project],
        http: `GET ${P}/assets/bin`,
        table: [
            { key: 'id', header: 'id' },
            { key: 'filename', header: 'file' },
            { key: 'deletedAt', header: 'binned' },
            { key: 'deletedBy', header: 'by' }
        ],
        readOnly: true
    },
    {
        name: 'restore',
        summary: 'Take a file out of the bin',
        args: [project, assetArg],
        http: `POST ${P}/assets/{id}/restore`,
        done: (_r, a) => `${a.id} is back.`
    },
    {
        name: 'purge',
        summary: 'Delete a binned file for good (admins)',
        args: [project, assetArg],
        http: `DELETE ${P}/assets/bin/{id}`,
        destructive: true,
        done: (_r, a) => `${a.id} is gone.`
    },
    {
        name: 'empty-bin',
        summary: 'Delete everything in the bin for good (admins)',
        args: [project],
        http: `DELETE ${P}/assets/bin`,
        destructive: true
    },
    {
        name: 'usage',
        summary: 'Where a file is used (or, without an id, how many places use each file)',
        args: [project, { ...assetArg, required: false }],
        run: async ctx => {
            const client = await ctx.client();
            const projectId = await ctx.project();
            return ctx.args.id
                ? client.assets.usage(projectId, String(ctx.args.id))
                : client.assets.usageCounts(projectId);
        },
        covers: [`GET ${P}/assets/{id}/usage`, `GET ${P}/assets/usage`],
        readOnly: true
    },
    {
        name: 'batch',
        summary:
            'Change several files at once (JSON: { action: bin|restore|move|update, ids, folder, changes })',
        args: [project],
        body: 'json',
        http: `POST ${P}/assets/batch`
    },
    {
        name: 'regenerate',
        summary: 'Remake the sizes of some files (or all)',
        args: [
            project,
            {
                name: 'ids',
                type: 'list',
                description: 'Files (default: all)',
                positional: 0,
                in: 'body',
                key: 'assetIds'
            },
            { name: 'background', type: 'boolean', description: 'Don’t wait for it', in: 'body' }
        ],
        http: `POST ${P}/assets/regenerate`
    },
    {
        name: 'video-check',
        summary: 'Ask the video host where a video stands',
        args: [project, assetArg],
        http: `POST ${P}/assets/{id}/video/check`
    },
    {
        name: 'video-retry',
        summary: 'Send a refused video to its host again',
        args: [project, assetArg],
        http: `POST ${P}/assets/{id}/video/retry`
    }
]);

export const mediaSettings = group('media-settings', [
    {
        name: 'get',
        summary: 'Storage, sizes and video hosts',
        args: [project],
        http: `GET ${P}/media-settings`,
        readOnly: true
    },
    {
        name: 'update',
        summary: 'Change media settings (JSON: { assetConfig, videoProviders })',
        args: [project],
        body: 'json',
        http: `PATCH ${P}/media-settings`
    },
    {
        name: 'check-storage',
        summary: 'Try storage settings before saving them (JSON: { adapter, adapterConfig })',
        args: [project],
        body: 'json',
        http: `POST ${P}/media-settings/check-storage`,
        readOnly: true
    },
    {
        name: 'move-storage',
        summary:
            'Move every file to another storage and switch to it (JSON: { adapter, adapterConfig })',
        args: [project],
        body: 'json',
        http: `POST ${P}/media-settings/move-storage`,
        destructive: true
    },
    {
        name: 'move-videos',
        summary: 'Move the videos to where new ones go',
        args: [
            project,
            {
                name: 'remove-old',
                type: 'boolean',
                description: 'Remove them from the old host',
                in: 'body',
                key: 'removeFromOld'
            }
        ],
        http: `POST ${P}/media-settings/move-videos`,
        destructive: true
    },
    {
        name: 'forget-host',
        summary: 'Forget a video host’s keys',
        args: [
            project,
            {
                name: 'host',
                description: 'mux, vimeo, cloudflare-stream…',
                required: true,
                positional: 0
            }
        ],
        http: `DELETE ${P}/media-settings/video-hosts/{host}`,
        destructive: true
    },
    {
        name: 'asset-config',
        summary: 'Image sizes and formats',
        args: [project],
        http: `GET ${P}/asset-config`,
        readOnly: true
    },
    {
        name: 'set-asset-config',
        summary: 'Change image sizes and formats (JSON)',
        args: [project],
        body: 'json',
        http: `PATCH ${P}/asset-config`
    }
]);
