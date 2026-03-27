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
        providers(): Promise<{ providers: string[] }> {
            return client.get('/auth/providers');
        }
    };
}
