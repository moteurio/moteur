/**
 * AI credits — project-level balance and deduction.
 * Stub implementation: in-memory per project; replace with DB in production.
 *
 * Set `MOTEUR_AI_CREDITS_DISABLED=1` to skip balance checks and deductions (unlimited credits)
 * until a real billing / quota system exists.
 */

const projectCredits = new Map<string, number>();

const DEFAULT_CREDITS = 1000;

/** Shown in API responses when credits are disabled (avoids MAX_SAFE_INTEGER in JSON). */
const UNLIMITED_REMAINING = 1_000_000;

function creditsDisabled(): boolean {
    const v = (process.env.MOTEUR_AI_CREDITS_DISABLED ?? '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}

/** True when `MOTEUR_AI_CREDITS_DISABLED` is set — no balance checks or deductions. */
export function isAiCreditsDisabled(): boolean {
    return creditsDisabled();
}

export function getCredits(projectId: string): number {
    if (creditsDisabled()) return UNLIMITED_REMAINING;
    const current = projectCredits.get(projectId);
    if (current !== undefined) return current;
    projectCredits.set(projectId, DEFAULT_CREDITS);
    return DEFAULT_CREDITS;
}

export function deductCredits(
    projectId: string,
    amount: number
): { success: boolean; remaining: number } {
    if (creditsDisabled()) {
        return { success: true, remaining: UNLIMITED_REMAINING };
    }
    const current = getCredits(projectId);
    if (current < amount) {
        return { success: false, remaining: current };
    }
    const remaining = current - amount;
    projectCredits.set(projectId, remaining);
    return { success: true, remaining };
}

/**
 * For tests: set a project's credit balance.
 */
export function setCredits(projectId: string, amount: number): void {
    projectCredits.set(projectId, amount);
}
