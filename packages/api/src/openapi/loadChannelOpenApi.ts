import type { OpenAPIV3 } from 'openapi-types';
import type { ModelSchema } from '@moteurio/types/Model.js';
import { getChannel } from '@moteurio/core/channels.js';
import { getModelSchemaForProject } from '@moteurio/core/models.js';
import { listNavigations } from '@moteurio/core/navigations.js';
import { listProjectKeys } from '@moteurio/core/utils/projectStorage.js';
import { modelListPrefix } from '@moteurio/core/utils/storageKeys.js';
import { buildChannelOpenApi } from './buildChannelOpenApi.js';

async function listModelSchemasForProject(projectId: string): Promise<ModelSchema[]> {
    const ids = await listProjectKeys(projectId, modelListPrefix());
    const out: ModelSchema[] = [];
    for (const id of ids) {
        const schema = await getModelSchemaForProject(projectId, id);
        if (schema) out.push(schema);
    }
    return out;
}

export function channelApiServerUrl(): string {
    const basePath = process.env.API_BASE_PATH || '';
    if (!basePath) return '/';
    return basePath.startsWith('/')
        ? basePath.replace(/\/$/, '') || '/'
        : `/${basePath.replace(/\/$/, '')}`;
}

export function channelPublicApiPaths(
    projectId: string,
    channelId: string
): { openApiJson: string } {
    const base = channelApiServerUrl().replace(/\/$/, '');
    return { openApiJson: `${base}/projects/${projectId}/channels/${channelId}/openapi` };
}

/** Load generated OpenAPI for one channel, or null if the channel does not exist. */
export async function loadChannelOpenApiDocument(
    projectId: string,
    channelId: string
): Promise<OpenAPIV3.Document | null> {
    const channel = await getChannel(projectId, channelId);
    if (!channel) return null;
    const modelsById = new Map<string, ModelSchema | null>();
    let allModelsLoaded = false;
    for (const resource of channel.resources) {
        if (resource.resourceType !== 'model') continue;
        if (resource.resourceId === 'models') {
            if (!allModelsLoaded) {
                for (const schema of await listModelSchemasForProject(projectId)) {
                    modelsById.set(schema.id, schema);
                }
                allModelsLoaded = true;
            }
            continue;
        }
        if (modelsById.has(resource.resourceId)) continue;
        modelsById.set(
            resource.resourceId,
            await getModelSchemaForProject(projectId, resource.resourceId)
        );
    }
    const everyMenu = channel.resources.some(
        r => r.resourceType === 'menu' && r.resourceId === 'menus'
    );
    const menuHandles = everyMenu
        ? (await listNavigations(projectId)).map(n => n.handle)
        : undefined;
    return buildChannelOpenApi({
        projectId,
        channel,
        modelsById,
        menuHandles,
        serverUrl: channelApiServerUrl()
    });
}
