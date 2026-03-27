import { Router } from 'express';
import type { AuthProviderContribution } from '@moteurio/types/Plugin.js';

import login, { openapi as loginSpec, schemas as loginSchemas } from './login.js';
import {
    createProvidersRoute,
    openapi as providersSpec,
    schemas as providersSchemas
} from './providers.js';
import refresh, { openapi as refreshSpec } from './refresh.js';
import me, { openapi as meSpec } from './me.js';
import sessionToken, { openapi as sessionTokenSpec } from './sessionToken.js';

export function createAuthRouter(authProviders: AuthProviderContribution[] = []): Router {
    const router: Router = Router();
    router.use(login);
    router.use(createProvidersRoute(authProviders));
    router.use(refresh);
    router.use(me);
    router.use('/session-token', sessionToken);
    return router;
}

export const authSpecs = {
    paths: {
        ...loginSpec,
        ...providersSpec,
        ...refreshSpec,
        ...meSpec,
        ...sessionTokenSpec
    },
    schemas: {
        ...loginSchemas,
        ...providersSchemas
    }
};

export default createAuthRouter();
