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
import sessions, { openapi as sessionsSpec } from './sessions.js';
import providerSignIn, { openapi as providerSignInSpec } from './providerSignIn.js';
import twoFactor, { openapi as twoFactorSpec } from './twoFactor.js';
import emailSignIn, { openapi as emailSignInSpec } from './emailSignIn.js';

export function createAuthRouter(authProviders: AuthProviderContribution[] = []): Router {
    const router: Router = Router();
    router.use(login);
    router.use(createProvidersRoute(authProviders));
    router.use(refresh);
    router.use(me);
    router.use('/session-token', sessionToken);
    router.use(sessions);
    router.use(providerSignIn);
    router.use(twoFactor);
    router.use(emailSignIn);
    return router;
}

export const authSpecs = {
    paths: {
        ...loginSpec,
        ...providersSpec,
        ...refreshSpec,
        ...meSpec,
        ...sessionTokenSpec,
        ...sessionsSpec,
        ...providerSignInSpec,
        ...twoFactorSpec,
        ...emailSignInSpec
    },
    schemas: {
        ...loginSchemas,
        ...providersSchemas
    }
};

export default createAuthRouter();
