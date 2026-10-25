import { revokeAuthSession } from './authSessions.js';
import { storageConfig } from './config/storageConfig.js';
import { readPrivateState, writePrivateState } from './utils/privateStore.js';
import { withWriteLock } from './utils/projectWriteLock.js';
import { reloadUsers } from './users.js';
import type { User } from '@moteurio/types/User.js';
import { triggerEvent } from './utils/eventBus.js';

export const PROVIDER_KEYS: Record<string, string> = {
    github: 'githubId',
    google: 'googleSub',
    microsoft: 'microsoftSub',
    oidc: 'oidcSub'
};
export function connectedProviders(user: User): string[] {
    return Object.keys(PROVIDER_KEYS).filter(id => user.auth?.[PROVIDER_KEYS[id]] != null);
}
export async function disconnectProvider(userId: string, provider: string): Promise<User> {
    const key = Object.hasOwn(PROVIDER_KEYS, provider) ? PROVIDER_KEYS[provider] : undefined;
    if (!key) throw Object.assign(new Error('Unknown provider'), { status: 400 });
    return withWriteLock(storageConfig.usersFile, async () => {
        const users = readPrivateState<User[]>(storageConfig.usersFile, []);
        const user = users.find(item => item.id === userId && item.isActive);
        if (!user) throw Object.assign(new Error('Account unavailable'), { status: 401 });
        if (
            !user.passwordHash &&
            connectedProviders(user).filter(id => id !== provider).length === 0
        ) {
            throw Object.assign(new Error('Keep at least one sign-in method connected.'), {
                status: 409
            });
        }
        const auth = { ...user.auth };
        delete auth[key];
        const updated = { ...user, auth, authVersion: (user.authVersion ?? 0) + 1 };
        await triggerEvent('user.beforeUpdate', { user: updated, performedBy: user });
        writePrivateState(
            storageConfig.usersFile,
            users.map(item => (item.id === userId ? updated : item))
        );
        reloadUsers();
        revokeAuthSession(userId);
        await triggerEvent('user.afterUpdate', { user: updated, performedBy: user });
        return updated;
    });
}
