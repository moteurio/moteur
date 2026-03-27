import type { MoteurClient } from '../client.js';
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
import { projectWebhooksApi } from '../project/webhooks.js';
import { projectAssetsApi } from '../project/assets.js';
import { projectAssetConfigApi } from '../project/assetConfig.js';
import { projectBlocksApi } from '../project/blocks.js';
import { projectApiKeyApi } from '../project/apiKey.js';

/** Project-scoped API: same HTTP routes as the root client, with `projectId` fixed. */
export function createProjectClient(client: MoteurClient, projectId: string) {
    const pid = projectId;
    const projects = projectsApi(client);
    const models = modelsApi(client);
    const entries = entriesApi(client);
    const pages = projectPagesApi(client);
    const templates = projectTemplatesApi(client);
    const layouts = projectLayoutsApi(client);
    const structures = projectStructuresApi(client);
    const collections = projectCollectionsApi(client);
    const forms = projectFormsApi(client);
    const submissions = projectSubmissionsApi(client);
    const navigations = projectNavigationsApi(client);
    const webhooks = projectWebhooksApi(client);
    const assets = projectAssetsApi(client);
    const assetConfig = projectAssetConfigApi(client);
    const blocks = projectBlocksApi(client);
    const apiKey = projectApiKeyApi(client);

    return {
        projectId: pid,

        project: {
            get: () => projects.get(pid),
            update: (body: Record<string, unknown>) => projects.update(pid, body),
            delete: () => projects.delete(pid),
            users: () => projects.users(pid)
        },

        branches: {
            list: () => projects.branches.list(pid),
            create: (name: string, from?: string) => projects.branches.create(pid, name, from),
            switch: (branch: string) => projects.branches.switch(pid, branch),
            merge: (sourceBranch: string) => projects.branches.merge(pid, sourceBranch)
        },

        radar: {
            get: (options?: {
                fullScan?: boolean;
                severity?: string;
                model?: string;
                locale?: string;
                ruleId?: string;
            }) => projects.radar.get(pid, options)
        },

        comments: {
            list: (params: {
                resourceType: string;
                resourceId: string;
                includeResolved?: boolean;
                fieldPath?: string;
            }) => projects.comments.list(pid, params),
            add: (body: {
                resourceType: string;
                resourceId: string;
                body: string;
                fieldPath?: string;
                blockId?: string;
                parentId?: string;
            }) => projects.comments.add(pid, body),
            resolve: (commentId: string) => projects.comments.resolve(pid, commentId),
            delete: (commentId: string) => projects.comments.delete(pid, commentId),
            edit: (commentId: string, body: { body: string }) =>
                projects.comments.edit(pid, commentId, body)
        },

        activity: {
            list: (params?: { limit?: number; before?: string }) =>
                projects.activity.list(pid, params)
        },

        models: {
            list: () => models.list(pid),
            get: (modelId: string) => models.get(pid, modelId),
            create: (body: Record<string, unknown>) => models.create(pid, body),
            update: (modelId: string, body: Record<string, unknown>) =>
                models.update(pid, modelId, body),
            delete: (modelId: string) => models.delete(pid, modelId)
        },

        entries: {
            list: (
                modelId: string,
                params?: { status?: string; limit?: number; offset?: string }
            ) => entries.list(pid, modelId, params),
            get: (modelId: string, entryId: string) => entries.get(pid, modelId, entryId),
            create: (modelId: string, body: Record<string, unknown>) =>
                entries.create(pid, modelId, body),
            update: (modelId: string, entryId: string, body: Record<string, unknown>) =>
                entries.update(pid, modelId, entryId, body),
            delete: (modelId: string, entryId: string) => entries.delete(pid, modelId, entryId),
            status: (modelId: string, entryId: string, status: string) =>
                entries.status(pid, modelId, entryId, status),
            submitReview: (modelId: string, entryId: string) =>
                entries.submitReview(pid, modelId, entryId)
        },

        pages: {
            list: () => pages.list(pid),
            get: (pageId: string) => pages.get(pid, pageId),
            getBySlug: (slug: string) => pages.getBySlug(pid, slug),
            create: (body: Record<string, unknown>) => pages.create(pid, body),
            update: (pageId: string, body: Record<string, unknown>) =>
                pages.update(pid, pageId, body),
            delete: (pageId: string) => pages.delete(pid, pageId),
            status: (pageId: string, status: string) => pages.status(pid, pageId, status),
            submitReview: (pageId: string) => pages.submitReview(pid, pageId)
        },

        templates: {
            list: () => templates.list(pid),
            get: (templateId: string) => templates.get(pid, templateId),
            create: (body: Record<string, unknown>) => templates.create(pid, body),
            update: (templateId: string, body: Record<string, unknown>) =>
                templates.update(pid, templateId, body),
            delete: (templateId: string) => templates.delete(pid, templateId)
        },

        layouts: {
            list: () => layouts.list(pid),
            get: (layoutId: string) => layouts.get(pid, layoutId),
            create: (body: Record<string, unknown>) => layouts.create(pid, body),
            update: (layoutId: string, body: Record<string, unknown>) =>
                layouts.update(pid, layoutId, body),
            delete: (layoutId: string) => layouts.delete(pid, layoutId)
        },

        structures: {
            list: () => structures.list(pid),
            get: (structureId: string) => structures.get(pid, structureId),
            create: (body: Record<string, unknown>) => structures.create(pid, body),
            update: (structureId: string, body: Record<string, unknown>) =>
                structures.update(pid, structureId, body),
            delete: (structureId: string) => structures.delete(pid, structureId)
        },

        collections: {
            list: () => collections.list(pid),
            get: (collectionId: string) => collections.get(pid, collectionId),
            create: (body: Record<string, unknown>) => collections.create(pid, body),
            update: (collectionId: string, body: Record<string, unknown>) =>
                collections.update(pid, collectionId, body),
            delete: (collectionId: string) => collections.delete(pid, collectionId)
        },

        forms: {
            list: () => forms.list(pid),
            get: (formId: string) => forms.get(pid, formId),
            create: (body: Record<string, unknown>) => forms.create(pid, body),
            update: (formId: string, body: Record<string, unknown>) =>
                forms.update(pid, formId, body),
            delete: (formId: string) => forms.delete(pid, formId)
        },

        submissions: {
            list: (formId: string, params?: { limit?: number; offset?: string }) =>
                submissions.list(pid, formId, params),
            get: (formId: string, submissionId: string) =>
                submissions.get(pid, formId, submissionId),
            delete: (formId: string, submissionId: string) =>
                submissions.delete(pid, formId, submissionId)
        },

        navigations: {
            list: () => navigations.list(pid),
            get: (navigationId: string) => navigations.get(pid, navigationId),
            create: (body: Record<string, unknown>) => navigations.create(pid, body),
            update: (navigationId: string, body: Record<string, unknown>) =>
                navigations.update(pid, navigationId, body),
            delete: (navigationId: string) => navigations.delete(pid, navigationId)
        },

        webhooks: {
            list: () => webhooks.list(pid),
            get: (webhookId: string) => webhooks.get(pid, webhookId),
            create: (body: Record<string, unknown>) => webhooks.create(pid, body),
            update: (webhookId: string, body: Record<string, unknown>) =>
                webhooks.update(pid, webhookId, body),
            delete: (webhookId: string) => webhooks.delete(pid, webhookId),
            test: (webhookId: string) => webhooks.test(pid, webhookId)
        },

        assets: {
            list: (params?: { type?: string; folder?: string; search?: string }) =>
                assets.list(pid, params),
            get: (id: string) => assets.get(pid, id),
            upload: (formData: FormData) => assets.upload(pid, formData),
            update: (id: string, body: Record<string, unknown>) => assets.update(pid, id, body),
            delete: (id: string) => assets.delete(pid, id),
            regenerate: (assetIds?: string[]) => assets.regenerate(pid, assetIds),
            move: (id: string, folder: string) => assets.move(pid, id, folder)
        },

        assetConfig: {
            get: () => assetConfig.get(pid),
            update: (body: Record<string, unknown>) => assetConfig.update(pid, body)
        },

        blocks: {
            list: () => blocks.list(pid),
            get: (id: string) => blocks.get(pid, id),
            create: (body: Record<string, unknown>) => blocks.create(pid, body),
            update: (id: string, body: Record<string, unknown>) => blocks.update(pid, id, body),
            delete: (id: string) => blocks.delete(pid, id)
        },

        apiKey: {
            get: () => apiKey.get(pid),
            generate: () => apiKey.generate(pid),
            rotate: () => apiKey.rotate(pid),
            revoke: () => apiKey.revoke(pid)
        }
    };
}

export type ProjectClient = ReturnType<typeof createProjectClient>;
