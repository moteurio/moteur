import type * as Projects from './projects';
import type * as Layouts from './layouts';
import type * as Structures from './structures';
import type * as Activity from './activityLogger';
//import type * as Fields from '../api/fields';
import type * as Blocks from './blocks';
import type * as Comments from './comments';
import type * as Reviews from './reviews';
import type * as Notifications from './notifications';
import type * as Templates from './templates';
import type * as Pages from './pages';
import type * as ApiCollections from './apiCollections';
import type * as Navigations from './navigations';
import type * as ProjectApiKey from './projectApiKey';
import type * as Assets from './assets/assetService';
import type * as Webhooks from './webhooks/webhookService';
import type * as Forms from './forms';
import type * as FormSubmissions from './formSubmissions';
import type * as Schedules from './schedules';

export interface MoteurAPI {
    projects: typeof Projects;
    templates: typeof Templates;
    pages: typeof Pages;
    layouts: typeof Layouts;
    structures: typeof Structures;
    activity: Pick<typeof Activity, 'getLog' | 'getProjectLog' | 'getGlobalLog'>;
    blocks: typeof Blocks;
    comments: {
        add: typeof Comments.addComment;
        get: typeof Comments.getComments;
        resolve: typeof Comments.resolveComment;
        delete: typeof Comments.deleteComment;
        edit: typeof Comments.editComment;
    };
    reviews: {
        submit: typeof Reviews.submitForReview;
        submitPage: typeof Reviews.submitForPageReview;
        approve: typeof Reviews.approveReview;
        reject: typeof Reviews.rejectReview;
        get: typeof Reviews.getReviews;
        getOne: typeof Reviews.getReview;
    };
    notifications: {
        get: typeof Notifications.getNotifications;
        markRead: typeof Notifications.markRead;
        markAllRead: typeof Notifications.markAllRead;
    };
    collections: {
        list: typeof ApiCollections.listCollections;
        get: typeof ApiCollections.getCollection;
        create: typeof ApiCollections.createCollection;
        update: typeof ApiCollections.updateCollection;
        delete: typeof ApiCollections.deleteCollection;
    };
    navigations: {
        list: typeof Navigations.listNavigations;
        get: typeof Navigations.getNavigation;
        getByHandle: typeof Navigations.getNavigationByHandle;
        create: typeof Navigations.createNavigation;
        update: typeof Navigations.updateNavigation;
        delete: typeof Navigations.deleteNavigation;
        resolve: typeof Navigations.resolveNavigation;
    };
    projectApiKey: {
        generate: typeof ProjectApiKey.generateKey;
        rotate: typeof ProjectApiKey.rotateKey;
        revoke: typeof ProjectApiKey.revokeKey;
    };
    assets: {
        upload: typeof Assets.uploadAsset;
        list: typeof Assets.listAssets;
        get: typeof Assets.getAsset;
        update: typeof Assets.updateAsset;
        delete: typeof Assets.deleteAsset;
        move: typeof Assets.moveToFolder;
        regenerate: typeof Assets.regenerateVariants;
        migrateProvider: typeof Assets.migrateProvider;
        getConfig: typeof Assets.getAssetConfig;
        updateConfig: typeof Assets.updateAssetConfig;
    };
    webhooks: {
        list: typeof Webhooks.listWebhooks;
        get: typeof Webhooks.getWebhook;
        create: typeof Webhooks.createWebhook;
        update: typeof Webhooks.updateWebhook;
        delete: typeof Webhooks.deleteWebhook;
        rotateSecret: typeof Webhooks.rotateSecret;
        test: typeof Webhooks.sendTestPing;
        getLog: typeof Webhooks.getDeliveryLog;
        retryDelivery: typeof Webhooks.retryDelivery;
        dispatch: typeof Webhooks.dispatch;
    };
    forms: {
        list: typeof Forms.listForms;
        get: typeof Forms.getForm;
        getForProject: typeof Forms.getFormForProject;
        create: typeof Forms.createForm;
        update: typeof Forms.updateForm;
        delete: typeof Forms.deleteForm;
    };
    formSubmissions: {
        list: typeof FormSubmissions.listSubmissions;
        get: typeof FormSubmissions.getSubmission;
        delete: typeof FormSubmissions.deleteSubmission;
        create: typeof FormSubmissions.createSubmission;
    };
    schedules: {
        list: typeof Schedules.listSchedules;
        get: typeof Schedules.getSchedule;
        getSchedulesForResource: typeof Schedules.getSchedulesForResource;
        create: typeof Schedules.createSchedule;
        cancel: typeof Schedules.cancelSchedule;
        delete: typeof Schedules.deleteSchedule;
    };
}
