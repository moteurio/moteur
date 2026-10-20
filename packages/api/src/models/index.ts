import { Router } from 'express';
import { mergePathSpecs } from '../utils/mergePathSpecs.js';
import getAll, { openapi as getAllSpec } from './getAll.js';
import getModelById, { openapi as getOneSpec } from './getOne.js';
import create, { openapi as createSpec, schemas as createSchemas } from './create.js';
import update, { openapi as updateSpec } from './update.js';
import remove, { openapi as deleteSpec } from './delete.js';
import revisions, { openapi as revisionsSpec } from './revisions.js';

const router: Router = Router({ mergeParams: true });

router.use(revisions);
router.use(getAll);
router.use(getModelById);
router.use(create);
router.use(update);
router.use(remove);

export const modelsSpecs = {
    paths: mergePathSpecs(
        revisionsSpec,
        getAllSpec,
        getOneSpec,
        createSpec,
        updateSpec,
        deleteSpec
    ),
    schemas: {
        ...createSchemas
    }
};

export default router;
