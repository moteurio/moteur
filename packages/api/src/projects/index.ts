import { Router } from 'express';

import { mergePathSpecs } from '../utils/mergePathSpecs.js';

import getAll, { openapi as getAllSpec } from './getAll.js';
import getOne, { openapi as getOneSpec } from './getOne.js';
import create, { openapi as createSpec, schemas as createSchemas } from './create.js';
import update, { openapi as updateSpec } from './update.js';
import remove, { openapi as deleteSpec } from './delete.js';
import users, { openapi as usersSpec } from './users.js';

import activityRouter, {
    openapi as activitySpec,
    schemas as activitySchemas
} from './activity/index.js';
import commentsRouter, {
    openapi as commentsSpec,
    schemas as commentsSchemas
} from './comments/index.js';
import reviewsRouter, { openapi as reviewsSpec } from './reviews/index.js';
import notificationsRouter, { openapi as notificationsSpec } from './notifications/index.js';
import pageOutputsRouter, { openapi as pageOutputsSpec } from './pageOutputs.js';
import radarRouter, { openapi as radarSpec } from './radar/index.js';
import branchesRouter, { openapi as branchesSpec } from './branches/index.js';
import gitLogRouter, { openapi as gitLogSpec } from './gitLog.js';
import aiAuditRouter, { openapi as aiAuditSpec } from './ai-audit/index.js';
import { optionalAuth, apiKeyAuth, requireCollectionOrProjectAccess } from '../middlewares/auth.js';

import templatesRouter, { openapi as templatesSpec } from '../studio/templates/index.js';
import pagesStudioRouter, { openapi as pagesStudioSpec } from '../studio/pages/index.js';
import structuresRouter, { openapi as structuresSpec } from '../studio/structures/index.js';
import layoutsRouter, { openapi as layoutsSpec } from '../studio/layouts/index.js';
import { openapi as collectionsStudioSpec } from '../studio/collections/index.js';
import apiKeysRouter, { openapi as apiKeysSpec } from '../studio/apiKeys/index.js';
import assetsRouter, { openapi as assetsSpec } from '../studio/assets/index.js';
import assetConfigRouter, { openapi as assetConfigSpec } from '../studio/assetConfig.js';
import mediaSettingsRouter, { openapi as mediaSettingsSpec } from '../studio/mediaSettings.js';
import navigationsRouter, { openapi as navigationsSpec } from '../studio/navigations/index.js';
import webhooksRouter, { openapi as webhooksSpec } from '../studio/webhooks/index.js';
import formsStudioRouter, { openapi as formsStudioSpec } from '../studio/forms/index.js';
import blocksStudioRouter, { openapi as blocksStudioSpec } from '../studio/blocks.js';
import collectionsPublicRouter, { openapi as collectionsPublicSpec } from './collections/public.js';

const router: Router = Router();

router.use(getAll);
router.use(getOne);
router.use(create);
router.use(update);
router.use(remove);
router.use(users);
router.use('/:projectId/templates', templatesRouter);
router.use('/:projectId/pages', pagesStudioRouter);
router.use('/:projectId', pageOutputsRouter);
router.use('/:projectId/navigations', navigationsRouter);
router.use('/:projectId/forms', formsStudioRouter);
router.use('/:projectId/structures', structuresRouter);
router.use('/:projectId/layouts', layoutsRouter);
router.use('/:projectId/api-keys', apiKeysRouter);
router.use('/:projectId/assets', assetsRouter);
router.use('/:projectId/asset-config', assetConfigRouter);
router.use('/:projectId/media-settings', mediaSettingsRouter);
router.use('/:projectId/webhooks', webhooksRouter);
router.use('/:projectId/blocks', blocksStudioRouter);
router.use(
    '/:projectId/collections',
    optionalAuth,
    apiKeyAuth,
    requireCollectionOrProjectAccess,
    collectionsPublicRouter
);
router.use('/:projectId/activity', activityRouter);
router.use('/:projectId/comments', commentsRouter);
router.use('/:projectId/reviews', reviewsRouter);
router.use('/:projectId/notifications', notificationsRouter);
router.use('/:projectId/radar', radarRouter);
router.use('/:projectId/branches', branchesRouter);
router.use('/:projectId/git', gitLogRouter);
router.use('/:projectId/ai-audit', aiAuditRouter);

export const projectsSpecs = {
    paths: mergePathSpecs(
        getAllSpec,
        getOneSpec,
        createSpec,
        updateSpec,
        deleteSpec,
        usersSpec,
        activitySpec,
        commentsSpec,
        reviewsSpec,
        notificationsSpec,
        pageOutputsSpec,
        templatesSpec,
        pagesStudioSpec,
        structuresSpec,
        layoutsSpec,
        collectionsStudioSpec,
        apiKeysSpec,
        assetsSpec,
        assetConfigSpec,
        mediaSettingsSpec,
        navigationsSpec,
        webhooksSpec,
        formsStudioSpec,
        blocksStudioSpec,
        collectionsPublicSpec,
        radarSpec,
        branchesSpec,
        gitLogSpec,
        aiAuditSpec
    ),
    schemas: {
        ...createSchemas,
        ...activitySchemas,
        ...commentsSchemas
    }
};

export default router;
