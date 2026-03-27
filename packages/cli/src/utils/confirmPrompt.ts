import { confirm, isCancel, cancel } from '@clack/prompts';

/**
 * For destructive actions: prompt "Are you sure?" unless --yes or --force is set.
 * Returns true to proceed, false to abort. When args.yes/force, returns true without prompting.
 */
export async function confirmDestructive(
    actionDescription: string,
    args: { yes?: unknown; force?: unknown }
): Promise<boolean> {
    if (args.yes === true || args.yes === 'true' || args.force === true || args.force === 'true') {
        return true;
    }
    const result = await confirm({
        message: `${actionDescription} Are you sure?`,
        initialValue: false
    });
    if (isCancel(result)) {
        cancel('Cancelled.');
        process.exit(0);
    }
    return result === true;
}
