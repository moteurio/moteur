import type { MoteurClient } from '../client.js';
import type { ActivityLogPage } from '@moteurio/types';

export function activityApi(client: MoteurClient) {
    return {
        list(params?: { limit?: number; before?: string }): Promise<ActivityLogPage> {
            return client.get('/activity', params as Record<string, string>);
        }
    };
}
