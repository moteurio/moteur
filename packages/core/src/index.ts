import * as Projects from './projects.js';
import * as Templates from './templates.js';
import * as Pages from './pages.js';
import * as Layouts from './layouts.js';
import * as Structures from './structures.js';
import * as ActivityLogger from './activityLogger.js';
import * as Blocks from './blocks.js';
import * as Comments from './comments.js';
import * as Reviews from './reviews.js';
import * as Notifications from './notifications.js';
import * as ApiCollections from './apiCollections.js';
import * as Navigations from './navigations.js';
import * as ProjectApiKey from './projectApiKey.js';
import * as Assets from './assets/assetService.js';
import * as Webhooks from './webhooks/webhookService.js';
import * as Forms from './forms.js';
import * as FormSubmissions from './formSubmissions.js';
import * as Schedules from './schedules.js';

import type { MoteurAPI } from './MoteurAPI.js';

import './fields/index.js';
import './assets/index.js';

export * from './forms.js';
export {
    listSubmissions,
    getSubmission,
    deleteSubmission,
    createSubmission,
    type ListSubmissionsOptions
} from './formSubmissions.js';

export {
    listSchedules,
    getSchedule,
    getSchedulesForResource,
    createSchedule,
    cancelSchedule,
    deleteSchedule,
    type ListSchedulesOptions,
    type CreateScheduleInput
} from './schedules.js';

export * as schedulerEngine from './schedulerEngine.js';
export { SnapshotService } from './snapshotService.js';
export {
    startSnapshotScheduler,
    stopSnapshotScheduler,
    type SnapshotScheduleConfig
} from './snapshotScheduler.js';

export { projectDir } from './utils/pathUtils.js';
export {
    resolveEntryDataForLocale,
    resolveEntryDataForLocaleDeep
} from './entryLocaleResolution.js';
export { addAndCommit, isGitRepo, push } from './git/index.js';
export { storageConfig, validateStorageConfig } from './config/storageConfig.js';
export type { StorageAdapter, UploadResult } from './assets/StorageAdapter.js';
export type { VideoProvider, VideoProviderUploadResult } from './assets/VideoProvider.js';
export { registerCorePlugins, registerHostPlugins } from './plugins/registerCorePlugins.js';
export { createPluginContext } from './plugins/pluginContext.js';
export type { PluginContext } from './plugins/pluginContext.js';
export type { CorePluginModule } from './plugins/registerCorePlugins.js';

export {
    parseEntryJsonStoragePath,
    entrySearchObjectId,
    flattenEntryDataForSearch,
    buildEntrySearchRecord,
    searchIndexNameForProject
} from './search/entrySearchRecord.js';

export const Moteur: MoteurAPI = {
    projects: Projects,
    templates: Templates,
    pages: Pages,
    layouts: Layouts,
    structures: Structures,
    activity: {
        getLog: ActivityLogger.getLog,
        getProjectLog: ActivityLogger.getProjectLog,
        getGlobalLog: ActivityLogger.getGlobalLog
    },
    blocks: Blocks,
    comments: {
        add: Comments.addComment,
        get: Comments.getComments,
        resolve: Comments.resolveComment,
        delete: Comments.deleteComment,
        edit: Comments.editComment
    },
    reviews: {
        submit: Reviews.submitForReview,
        submitPage: Reviews.submitForPageReview,
        approve: Reviews.approveReview,
        reject: Reviews.rejectReview,
        get: Reviews.getReviews,
        getOne: Reviews.getReview
    },
    notifications: {
        get: Notifications.getNotifications,
        markRead: Notifications.markRead,
        markAllRead: Notifications.markAllRead
    },
    collections: {
        list: ApiCollections.listCollections,
        get: ApiCollections.getCollection,
        create: ApiCollections.createCollection,
        update: ApiCollections.updateCollection,
        delete: ApiCollections.deleteCollection
    },
    navigations: {
        list: Navigations.listNavigations,
        get: Navigations.getNavigation,
        getByHandle: Navigations.getNavigationByHandle,
        create: Navigations.createNavigation,
        update: Navigations.updateNavigation,
        delete: Navigations.deleteNavigation,
        resolve: Navigations.resolveNavigation
    },
    projectApiKey: {
        generate: ProjectApiKey.generateKey,
        rotate: ProjectApiKey.rotateKey,
        revoke: ProjectApiKey.revokeKey
    },
    assets: {
        upload: Assets.uploadAsset,
        list: Assets.listAssets,
        get: Assets.getAsset,
        update: Assets.updateAsset,
        delete: Assets.deleteAsset,
        move: Assets.moveToFolder,
        regenerate: Assets.regenerateVariants,
        migrateProvider: Assets.migrateProvider,
        getConfig: Assets.getAssetConfig,
        updateConfig: Assets.updateAssetConfig
    },
    webhooks: {
        list: Webhooks.listWebhooks,
        get: Webhooks.getWebhook,
        create: Webhooks.createWebhook,
        update: Webhooks.updateWebhook,
        delete: Webhooks.deleteWebhook,
        rotateSecret: Webhooks.rotateSecret,
        test: Webhooks.sendTestPing,
        getLog: Webhooks.getDeliveryLog,
        retryDelivery: Webhooks.retryDelivery,
        dispatch: Webhooks.dispatch
    },
    forms: {
        list: Forms.listForms,
        get: Forms.getForm,
        getForProject: Forms.getFormForProject,
        create: Forms.createForm,
        update: Forms.updateForm,
        delete: Forms.deleteForm
    },
    formSubmissions: {
        list: FormSubmissions.listSubmissions,
        get: FormSubmissions.getSubmission,
        delete: FormSubmissions.deleteSubmission,
        create: FormSubmissions.createSubmission
    },
    schedules: {
        list: Schedules.listSchedules,
        get: Schedules.getSchedule,
        getSchedulesForResource: Schedules.getSchedulesForResource,
        create: Schedules.createSchedule,
        cancel: Schedules.cancelSchedule,
        delete: Schedules.deleteSchedule
    }
};

export default Moteur;
