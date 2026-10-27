import type { OpenAPIV3 } from 'openapi-types';
import type { Channel, ChannelResource } from '@moteurio/types/Channel.js';
import type { ModelSchema } from '@moteurio/types/Model.js';
import { entryQueryParameters } from '../utils/entryQuery.js';
import { resolveAssetsParameter, resolveUrlParameter } from '../utils/queryFlag.js';
import { openApiEntryDataSchema, plainText } from './modelFieldOpenApi.js';

export type BuildChannelOpenApiInput = {
    projectId: string;
    channel: Channel;
    /** Model schemas keyed by model id (only models referenced by the channel need to be present). */
    modelsById: Map<string, ModelSchema | null>;
    /** Every menu handle in the project, used when the channel gives every menu. */
    menuHandles?: string[];
    serverUrl: string;
};

function channelBasePath(projectId: string, channelId: string): string {
    return `/projects/${projectId}/channels/${channelId}`;
}

function localeParameters(): OpenAPIV3.ParameterObject[] {
    const locale = {
        name: 'locale',
        in: 'query' as const,
        required: false,
        schema: { type: 'string' as const },
        description:
            'Resolve multilingual field values to this locale (falls back to project defaultLocale).'
    };
    return [
        locale,
        {
            ...locale,
            name: 'lang',
            description: 'Alias for `locale`.'
        }
    ];
}

function publicEntryQueryParameters(): OpenAPIV3.ParameterObject[] {
    return [
        ...localeParameters(),
        ...entryQueryParameters({ allowStatus: false }),
        resolveAssetsParameter(),
        resolveUrlParameter()
    ];
}

function jsonErrorResponse(): OpenAPIV3.ResponseObject {
    return {
        description: 'Error',
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    required: ['error'],
                    properties: { error: { type: 'string' } }
                }
            }
        }
    };
}

function entryListResponse(ref: string): OpenAPIV3.ResponseObject {
    return {
        description:
            'Array of entries. Header `X-Total-Count` is the match count before limit/offset.',
        headers: {
            'X-Total-Count': { schema: { type: 'integer' } }
        },
        content: {
            'application/json': {
                schema: { type: 'array', items: { $ref: ref } }
            }
        }
    };
}

function buildEntrySchemaName(modelId: string): string {
    return `Entry_${modelId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

const labelText = plainText;

const CHANNEL_TAG = 'channel';
const PAGES_TAG = 'pages';
const LAYOUTS_TAG = 'layouts';
const FORMS_TAG = 'forms';
const MENUS_TAG = 'menus';

/** Handles the channel gives, or undefined when it gives no menu. */
function exposedMenuHandles(channel: Channel, all: string[] = []): string[] | undefined {
    const rows = channel.resources.filter(r => r.resourceType === 'menu');
    if (rows.length === 0) return undefined;
    if (rows.some(r => r.resourceId === 'menus')) return [...all].sort();
    return rows.map(r => r.resourceId);
}

const menuSchemas: Record<string, OpenAPIV3.SchemaObject> = {
    MenuItem: {
        type: 'object',
        required: ['id', 'label', 'linkType'],
        properties: {
            id: { type: 'string' },
            label: { description: 'Text, or one value per locale.' },
            linkType: { type: 'string', enum: ['page', 'custom', 'asset', 'none'] },
            url: {
                type: 'string',
                description:
                    'Resolved page path, custom URL or asset URL. Absent when the target is gone.'
            },
            openInNewTab: { type: 'boolean' },
            children: { type: 'array', items: { $ref: '#/components/schemas/MenuItem' } }
        },
        additionalProperties: true
    },
    Menu: {
        type: 'object',
        required: ['id', 'name', 'handle', 'items'],
        properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            handle: { type: 'string' },
            type: { type: 'string' },
            maxDepth: { type: 'integer' },
            items: { type: 'array', items: { $ref: '#/components/schemas/MenuItem' } },
            updatedAt: { type: 'string', format: 'date-time' }
        },
        additionalProperties: true
    }
};

function modelResourcePaths(
    projectId: string,
    channelId: string,
    resource: ChannelResource,
    model: ModelSchema,
    schemas: Record<string, OpenAPIV3.SchemaObject>
): OpenAPIV3.PathsObject {
    const modelId = resource.resourceId;
    const label = labelText(model.label, modelId);
    const schemaName = buildEntrySchemaName(modelId);
    const resolveDepth = (resource.resolve ?? 0) as 0 | 1 | 2;

    schemas[schemaName] = {
        type: 'object',
        required: ['id', 'type', 'data'],
        properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: [modelId] },
            status: {
                type: 'string',
                enum: ['draft', 'in_review', 'published', 'unpublished'],
                description: 'With API key auth, only `published` entries are returned.'
            },
            data: openApiEntryDataSchema(label, model.fields ?? {}, resource.fields, resolveDepth),
            meta: { type: 'object', additionalProperties: true },
            resolvedUrl: {
                type: 'string',
                description: 'Present when `resolveUrl=1`.'
            }
        }
    };

    const base = `${channelBasePath(projectId, channelId)}/${modelId}/entries`;
    const params: OpenAPIV3.ParameterObject[] = publicEntryQueryParameters();

    return {
        [base]: {
            get: {
                summary: `List ${label} entries`,
                description: resource.fields?.length
                    ? `Returns only fields: ${resource.fields.join(', ')}. Reference depth: ${resolveDepth}.`
                    : `Reference depth: ${resolveDepth}.`,
                tags: [modelId],
                security: [{ ApiKeyAuth: [] }],
                parameters: params,
                responses: {
                    '200': entryListResponse(`#/components/schemas/${schemaName}`),
                    '400': jsonErrorResponse(),
                    '403': jsonErrorResponse(),
                    '404': jsonErrorResponse()
                }
            }
        },
        [`${base}/{entryId}`]: {
            get: {
                summary: `Get one ${label} entry`,
                tags: [modelId],
                security: [{ ApiKeyAuth: [] }],
                parameters: [
                    {
                        name: 'entryId',
                        in: 'path',
                        required: true,
                        schema: { type: 'string' }
                    },
                    ...localeParameters(),
                    resolveAssetsParameter(),
                    resolveUrlParameter()
                ],
                responses: {
                    '200': {
                        description: 'Entry',
                        content: {
                            'application/json': {
                                schema: { $ref: `#/components/schemas/${schemaName}` }
                            }
                        }
                    },
                    '404': jsonErrorResponse()
                }
            }
        }
    };
}

function hasPageResource(channel: Channel): ChannelResource | undefined {
    return channel.resources.find(r => r.resourceType === 'page');
}

function hasLayoutResource(channel: Channel): ChannelResource | undefined {
    return channel.resources.find(r => r.resourceType === 'layout');
}

function hasFormResource(channel: Channel): ChannelResource | undefined {
    return channel.resources.find(r => r.resourceType === 'form');
}

/**
 * Build an OpenAPI 3 document describing only the read routes exposed by one channel.
 * Intended for frontend developers (API key auth, published content).
 */
export function buildChannelOpenApi(input: BuildChannelOpenApiInput): OpenAPIV3.Document {
    const { projectId, channel, modelsById, menuHandles, serverUrl } = input;
    const channelId = channel.id;
    const tag = plainText(channel.label, channelId);
    const channelDescription = plainText(channel.description, tag);

    const paths: OpenAPIV3.PathsObject = {};
    const schemas: Record<string, OpenAPIV3.SchemaObject> = {};

    const metaPath = channelBasePath(projectId, channelId);
    paths[metaPath] = {
        get: {
            summary: 'Channel metadata',
            tags: [CHANNEL_TAG],
            security: [{ ApiKeyAuth: [] }],
            responses: {
                '200': {
                    description: 'Channel definition (resources, field allowlists, resolve depth)',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ChannelMeta' }
                        }
                    }
                },
                '404': jsonErrorResponse()
            }
        }
    };

    schemas.ChannelMeta = {
        type: 'object',
        required: ['id', 'projectId', 'label', 'resources'],
        properties: {
            id: { type: 'string' },
            projectId: { type: 'string' },
            label: { type: 'string' },
            description: { type: 'string' },
            resources: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        resourceType: {
                            type: 'string',
                            enum: ['model', 'page', 'layout', 'form', 'menu']
                        },
                        resourceId: { type: 'string' },
                        fields: { type: 'array', items: { type: 'string' } },
                        resolve: { type: 'integer', enum: [0, 1, 2] }
                    }
                }
            }
        }
    };

    const documentedModels = new Map<string, string>();
    const documentModel = (resource: ChannelResource, model: ModelSchema) => {
        Object.assign(paths, modelResourcePaths(projectId, channelId, resource, model, schemas));
        documentedModels.set(resource.resourceId, labelText(model.label, resource.resourceId));
    };

    // Explicit model rows win over "every model" for their own model (fields, resolve depth).
    for (const resource of channel.resources) {
        if (resource.resourceType !== 'model' || resource.resourceId === 'models') continue;
        const model = modelsById.get(resource.resourceId);
        if (model) documentModel(resource, model);
    }
    const everyModel = channel.resources.find(
        r => r.resourceType === 'model' && r.resourceId === 'models'
    );
    if (everyModel) {
        const all = [...modelsById.entries()]
            .filter((e): e is [string, ModelSchema] => e[1] != null)
            .filter(([id]) => !documentedModels.has(id))
            .sort((a, b) => labelText(a[1].label, a[0]).localeCompare(labelText(b[1].label, b[0])));
        for (const [modelId, model] of all) {
            documentModel({ ...everyModel, resourceId: modelId }, model);
        }
    }

    const pageResource = hasPageResource(channel);
    if (pageResource) {
        const pagesBase = `${metaPath}/pages`;
        paths[pagesBase] = {
            get: {
                summary: 'List pages',
                tags: [PAGES_TAG],
                security: [{ ApiKeyAuth: [] }],
                responses: {
                    '200': {
                        description: 'Page tree nodes',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: { type: 'object', additionalProperties: true }
                                }
                            }
                        }
                    },
                    '404': jsonErrorResponse()
                }
            }
        };
        paths[`${pagesBase}/by-slug/{slug}`] = {
            get: {
                summary: 'Get page by slug',
                tags: [PAGES_TAG],
                security: [{ ApiKeyAuth: [] }],
                parameters: [
                    { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
                    ...localeParameters()
                ],
                responses: {
                    '200': {
                        description: 'Page node',
                        content: {
                            'application/json': {
                                schema: { type: 'object', additionalProperties: true }
                            }
                        }
                    },
                    '404': jsonErrorResponse()
                }
            }
        };
        paths[`${pagesBase}/{pageId}`] = {
            get: {
                summary: 'Get page by id',
                tags: [PAGES_TAG],
                security: [{ ApiKeyAuth: [] }],
                parameters: [
                    { name: 'pageId', in: 'path', required: true, schema: { type: 'string' } }
                ],
                responses: {
                    '200': {
                        description: 'Page node',
                        content: {
                            'application/json': {
                                schema: { type: 'object', additionalProperties: true }
                            }
                        }
                    },
                    '404': jsonErrorResponse()
                }
            }
        };
    }

    if (hasLayoutResource(channel)) {
        const layoutsBase = `${metaPath}/layouts`;
        paths[layoutsBase] = {
            get: {
                summary: 'List layouts',
                tags: [LAYOUTS_TAG],
                security: [{ ApiKeyAuth: [] }],
                responses: {
                    '200': {
                        description: 'Layouts',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: { type: 'object', additionalProperties: true }
                                }
                            }
                        }
                    }
                }
            }
        };
        paths[`${layoutsBase}/{layoutId}`] = {
            get: {
                summary: 'Get layout by id',
                tags: [LAYOUTS_TAG],
                security: [{ ApiKeyAuth: [] }],
                parameters: [
                    { name: 'layoutId', in: 'path', required: true, schema: { type: 'string' } }
                ],
                responses: {
                    '200': {
                        description: 'Layout',
                        content: {
                            'application/json': {
                                schema: { type: 'object', additionalProperties: true }
                            }
                        }
                    },
                    '404': jsonErrorResponse()
                }
            }
        };
    }

    if (hasFormResource(channel)) {
        const formsBase = `${metaPath}/forms`;
        paths[formsBase] = {
            get: {
                summary: 'List forms',
                tags: [FORMS_TAG],
                security: [{ ApiKeyAuth: [] }],
                responses: {
                    '200': {
                        description: 'Form schemas exposed by this channel',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: { type: 'object', additionalProperties: true }
                                }
                            }
                        }
                    }
                }
            }
        };
        paths[`${formsBase}/{formId}`] = {
            get: {
                summary: 'Get form by id',
                tags: [FORMS_TAG],
                security: [{ ApiKeyAuth: [] }],
                parameters: [
                    { name: 'formId', in: 'path', required: true, schema: { type: 'string' } }
                ],
                responses: {
                    '200': {
                        description: 'Form schema',
                        content: {
                            'application/json': {
                                schema: { type: 'object', additionalProperties: true }
                            }
                        }
                    },
                    '404': jsonErrorResponse()
                }
            }
        };
    }

    const handles = exposedMenuHandles(channel, menuHandles);
    if (handles) {
        Object.assign(schemas, menuSchemas);
        const menusBase = `${metaPath}/menus`;
        paths[menusBase] = {
            get: {
                summary: 'List menus',
                description:
                    'Every menu this channel gives, with item URLs resolved. `locale` returns each label as one string.',
                tags: [MENUS_TAG],
                security: [{ ApiKeyAuth: [] }],
                parameters: localeParameters(),
                responses: {
                    '200': {
                        description: 'Menus',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: { $ref: '#/components/schemas/Menu' }
                                }
                            }
                        }
                    },
                    '404': jsonErrorResponse()
                }
            }
        };
        paths[`${menusBase}/{handle}`] = {
            get: {
                summary: 'Get menu by handle',
                tags: [MENUS_TAG],
                security: [{ ApiKeyAuth: [] }],
                parameters: [
                    {
                        name: 'handle',
                        in: 'path',
                        required: true,
                        schema: { type: 'string', ...(handles.length > 0 && { enum: handles }) }
                    },
                    ...localeParameters()
                ],
                responses: {
                    '200': {
                        description: 'Menu',
                        content: {
                            'application/json': { schema: { $ref: '#/components/schemas/Menu' } }
                        }
                    },
                    '404': jsonErrorResponse()
                }
            }
        };
    }

    return {
        openapi: '3.0.3',
        info: {
            title: `${tag} — Public API`,
            version: channel.updatedAt || '1.0.0',
            description: [
                `Read-only HTTP API for channel **${channelId}** on project **${projectId}**.`,
                '',
                'Authenticate with header **`x-api-key`** (project API key allowed to read this channel).',
                'Only **GET** is supported with API keys; responses use **published** entries unless you use JWT (Studio).',
                '',
                'Paths and `entry.data` shapes reflect this channel’s resource list, field allowlists, and reference `resolve` depth.',
                '',
                `OpenAPI JSON: \`${metaPath}/openapi\``
            ].join('\n')
        },
        servers: [{ url: serverUrl.replace(/\/$/, '') }],
        tags: [
            {
                name: CHANNEL_TAG,
                description: channelDescription,
                'x-displayName': 'Channel'
            },
            ...[...documentedModels].map(([id, label]) => ({
                name: id,
                description: `Entries of model \`${id}\``,
                'x-displayName': label,
                'x-moteur-kind': 'model'
            })),
            ...(hasPageResource(channel) ? [{ name: PAGES_TAG, 'x-displayName': 'Pages' }] : []),
            ...(hasLayoutResource(channel)
                ? [{ name: LAYOUTS_TAG, 'x-displayName': 'Layouts' }]
                : []),
            ...(hasFormResource(channel) ? [{ name: FORMS_TAG, 'x-displayName': 'Forms' }] : []),
            ...(handles ? [{ name: MENUS_TAG, 'x-displayName': 'Menus' }] : [])
        ] as OpenAPIV3.TagObject[],
        paths,
        components: {
            securitySchemes: {
                ApiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-api-key',
                    description:
                        'Project read-only API key (channel allowlist must include this channel).'
                }
            },
            schemas
        }
    };
}
