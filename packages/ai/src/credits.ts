/**
 * AI credits for a project this month, kept by the engine's metering (`@moteurio/core/metering`):
 * a monthly allowance set by the host (or `MOTEUR_AI_MONTHLY_CREDITS`), and a ledger of spends.
 *
 * Set `MOTEUR_AI_CREDITS_DISABLED=1` to skip balance checks and deductions (unlimited credits).
 */
import { creditBalance, grantCredits, spendCredits } from '@moteurio/core/metering.js';

/** Shown in API responses when credits are unlimited (avoids MAX_SAFE_INTEGER in JSON). */
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
    return creditBalance(projectId).remaining ?? UNLIMITED_REMAINING;
}

export function deductCredits(
    projectId: string,
    amount: number,
    reason?: string
): { success: boolean; remaining: number } {
    if (creditsDisabled()) {
        return { success: true, remaining: UNLIMITED_REMAINING };
    }
    const { success, remaining } = spendCredits(projectId, amount, reason ? { reason } : {});
    return { success, remaining: remaining ?? UNLIMITED_REMAINING };
}

/** Bring a project's balance this month to `amount` (tests, support), recorded as a grant. */
export function setCredits(projectId: string, amount: number): void {
    const { allowance, granted, used } = creditBalance(projectId);
    if (allowance === null) return;
    grantCredits(projectId, amount - (allowance + granted - used), { reason: 'set' });
}
