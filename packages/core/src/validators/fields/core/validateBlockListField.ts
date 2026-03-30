import type { Field, FieldValidationContext } from '@moteurio/types/Field.js';
import type { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { validateBlockInstances } from '../../validateBlockInstances.js';

export function validateBlockListField(
    value: any,
    field: Field,
    path: string,
    context?: FieldValidationContext
): ValidationIssue[] {
    const allowEmpty = field.options?.allowEmpty === true;
    if (value === undefined || value === null) {
        if (!allowEmpty) {
            return [
                {
                    type: 'error',
                    code: 'BLOCK_LIST_EMPTY',
                    message: 'Block list cannot be empty.',
                    path,
                    context: { value }
                }
            ];
        }
        return [];
    }

    const allowedBlockTypes = field.options?.allowedBlockTypes as string[] | undefined;
    const minBlocks = typeof field.options?.minBlocks === 'number' ? field.options.minBlocks : 0;
    const maxBlocks =
        typeof field.options?.maxBlocks === 'number' ? field.options.maxBlocks : undefined;

    return validateBlockInstances(value, path, {
        allowedBlockTypes: allowedBlockTypes?.length ? allowedBlockTypes : undefined,
        minBlocks,
        maxBlocks,
        issuePrefix: 'blockList',
        projectId: context?.projectId,
        allowHtmlIframe: context?.allowHtmlIframe === true,
        allowHtmlEmbed: context?.allowHtmlEmbed === true
    });
}
