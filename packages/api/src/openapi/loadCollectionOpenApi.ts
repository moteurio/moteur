import type { OpenAPIV3 } from 'openapi-types';
import type { ModelSchema } from '@moteurio/types/Model.js';
import { getCollection } from '@moteurio/core/apiCollections.js';
import { getModelSchemaForProject } from '@moteurio/core/models.js';
import { listNavigations } from '@moteurio/core/navigations.js';
import { listProjectKeys } from '@moteurio/core/utils/projectStorage.js';
import { modelListPrefix } from '@moteurio/core/utils/storageKeys.js';
import { buildCollectionOpenApi } from './buildCollectionOpenApi.js';

async function listModelSchemasForProject(projectId: string): Promise<ModelSchema[]> {
    const ids = await listProjectKeys(projectId, modelListPrefix());
    const out: ModelSchema[] = [];
    for (const id of ids) {
        const schema = await getModelSchemaForProject(projectId, id);
        if (schema) out.push(schema);
    }
    return out;
}

export function collectionApiServerUrl(): string {
    const basePath = process.env.API_BASE_PATH || '';
    if (!basePath) return '/';
    return basePath.startsWith('/')
        ? basePath.replace(/\/$/, '') || '/'
        : `/${basePath.replace(/\/$/, '')}`;
}

export function collectionPublicApiPaths(
    projectId: string,
    collectionId: string
): { openApiJson: string } {
    const base = collectionApiServerUrl().replace(/\/$/, '');
    return { openApiJson: `${base}/projects/${projectId}/collections/${collectionId}/openapi` };
}

/** Load generated OpenAPI for one collection, or null if the collection does not exist. */
export async function loadCollectionOpenApiDocument(
    projectId: string,
    collectionId: string
): Promise<OpenAPIV3.Document | null> {
    const collection = await getCollection(projectId, collectionId);
    if (!collection) return null;
    const modelsById = new Map<string, ModelSchema | null>();
    let allModelsLoaded = false;
    for (const resource of collection.resources) {
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
    const everyMenu = collection.resources.some(
        r => r.resourceType === 'menu' && r.resourceId === 'menus'
    );
    const menuHandles = everyMenu
        ? (await listNavigations(projectId)).map(n => n.handle)
        : undefined;
    return buildCollectionOpenApi({
        projectId,
        collection,
        modelsById,
        menuHandles,
        serverUrl: collectionApiServerUrl()
    });
}
