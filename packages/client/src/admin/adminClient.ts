import { createMoteurClientInternal } from '../client.js';
import { authApi } from './auth.js';
import { projectsApi } from './projects.js';
import { modelsApi } from '../project/models.js';
import { entriesApi } from '../project/entries.js';
import { projectPagesApi } from '../project/pages.js';
import { projectTemplatesApi } from '../project/templates.js';
import { projectLayoutsApi } from '../project/layouts.js';
import { projectStructuresApi } from '../project/structures.js';
import { projectCollectionsApi } from '../project/collections.js';
import { projectFormsApi } from '../project/forms.js';
import { projectSubmissionsApi } from '../project/submissions.js';
import { projectNavigationsApi } from '../project/navigations.js';
import { projectRedirectsApi } from '../project/redirects.js';
import { projectWebhooksApi } from '../project/webhooks.js';
import { projectSchedulesApi } from '../project/schedules.js';
import { projectAssetsApi } from '../project/assets.js';
import { projectAssetConfigApi } from '../project/assetConfig.js';
import { projectMediaSettingsApi } from '../project/mediaSettings.js';
import { projectBlocksApi } from '../project/blocks.js';
import { projectApiKeysApi } from '../project/apiKeys.js';
import { instanceApi } from './instance.js';
import { createProjectClient } from './forProject.js';
import { blueprintsApi } from './blueprints.js';
import { activityApi } from './activity.js';
import { aiApi } from './ai.js';
import { operatorApi } from './operator.js';
import type { MoteurClientConfig } from '../types.js';

/** Full SDK for JWT (or bearer): auth, projects, all `/projects/:id/...` resources, `/blueprints`, `instance` (deployment maintenance), optional global `/activity`. */
export function createMoteurAdminClient(config: MoteurClientConfig) {
    const client = createMoteurClientInternal(config);
    return {
        ...client,
        auth: authApi(client),
        projects: projectsApi(client),
        models: modelsApi(client),
        entries: entriesApi(client),
        pages: projectPagesApi(client),
        templates: projectTemplatesApi(client),
        layouts: projectLayoutsApi(client),
        structures: projectStructuresApi(client),
        collections: projectCollectionsApi(client),
        forms: projectFormsApi(client),
        submissions: projectSubmissionsApi(client),
        navigations: projectNavigationsApi(client),
        redirects: projectRedirectsApi(client),
        webhooks: projectWebhooksApi(client),
        schedules: projectSchedulesApi(client),
        assets: projectAssetsApi(client),
        assetConfig: projectAssetConfigApi(client),
        mediaSettings: projectMediaSettingsApi(client),
        blocks: projectBlocksApi(client),
        apiKeys: projectApiKeysApi(client),
        instance: instanceApi(client),
        blueprints: blueprintsApi(client),
        activity: activityApi(client),
        ai: aiApi(client),
        operator: operatorApi(client),
        forProject: (projectId: string) => createProjectClient(client, projectId)
    };
}

export type MoteurAdminClient = ReturnType<typeof createMoteurAdminClient>;
