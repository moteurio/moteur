import type { MoteurClient } from '../client.js';
import type { LoginResult } from '../types.js';
import type { User } from '@moteurio/types';

export function authApi(client: MoteurClient) {
    return {
        login(username: string, password: string): Promise<LoginResult> {
            return client.post<LoginResult>('/auth/login', { username, password });
        },
        me(): Promise<{ user: User }> {
            return client.get('/auth/me');
        },
        refresh(): Promise<{ token: string }> {
            return client.post<{ token: string }>('/auth/refresh');
        },
        /** OAuth providers the server can sign in with; send people to `/auth/{id}?next=…`. */
        providers(): Promise<{ providers: { id: string; label: string }[] }> {
            return client.get('/auth/providers');
        }
    };
}
