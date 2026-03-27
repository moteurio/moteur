/**
 * In-process snapshot scheduler. Fires on configured cron schedule per project.
 * Does not depend on external cron. Snapshots run async and non-blocking.
 */
import { loadProjects } from './projects.js';
import { getProjectJson } from './utils/projectStorage.js';
import { SNAPSHOT_SCHEDULE_KEY } from './utils/storageKeys.js';
import { SnapshotService } from './snapshotService.js';

export interface SnapshotScheduleConfig {
    enabled: boolean;
    /** Cron expression (e.g. '0 * * * *' hourly, '0 0 * * *' daily). Default hourly. */
    cron?: string;
}

const DEFAULT_CRON = '0 * * * *';
const SCHEDULER_USER = {
    id: '_snapshot',
    name: 'Snapshot Scheduler',
    isActive: true,
    email: '',
    roles: [] as string[],
    projects: [] as string[]
};

/** Minimal cron match: minute hour (0 * * * * = hourly at :00, 0 0 * * * = daily at midnight). */
function cronMatches(cron: string, date: Date): boolean {
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 2) return false;
    const minute = parseInt(parts[0]!, 10);
    const hour = parts.length >= 2 ? parseInt(parts[1]!, 10) : -1;
    if (date.getMinutes() !== minute) return false;
    if (hour >= 0 && date.getHours() !== hour) return false;
    return true;
}

let intervalId: ReturnType<typeof setInterval> | null = null;
const lastRunSlot = new Map<string, string>();

function slotKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
}

async function tick(): Promise<void> {
    const now = new Date();
    const currentSlot = slotKey(now);
    const projects = loadProjects();
    for (const project of projects) {
        try {
            const config = await getProjectJson<SnapshotScheduleConfig>(
                project.id,
                SNAPSHOT_SCHEDULE_KEY
            );
            if (!config?.enabled) continue;
            const cron = config.cron ?? DEFAULT_CRON;
            if (!cronMatches(cron, now)) continue;
            if (lastRunSlot.get(project.id) === currentSlot) continue;
            lastRunSlot.set(project.id, currentSlot);

            void SnapshotService.snapshotWorkspace(
                project.id,
                `Scheduled workspace snapshot — ${now.toISOString()}`,
                SCHEDULER_USER as any
            ).catch(() => {});
            void SnapshotService.snapshotUserData(
                project.id,
                `Scheduled user data snapshot — ${now.toISOString()}`,
                SCHEDULER_USER as any
            ).catch(() => {});
        } catch {
            // per-project: never throw
        }
    }
}

export function startSnapshotScheduler(intervalMs: number = 60_000): void {
    if (intervalId) return;
    intervalId = setInterval(() => void tick(), intervalMs);
    void tick();
}

export function stopSnapshotScheduler(): void {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
}
