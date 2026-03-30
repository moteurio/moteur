import { Layout } from '@moteurio/types/Layout.js';
import { ValidationResult } from '@moteurio/types/ValidationResult.js';
import { createValidationResult, addIssue } from '../utils/validation.js';
import { validateBlockInstances } from './validateBlockInstances.js';

export interface ValidateLayoutOptions {
    /** When set, block instances are validated against core + this project's block schemas. */
    projectId?: string;
    allowHtmlIframe?: boolean;
    allowHtmlEmbed?: boolean;
    /** Project's configured locales (defaultLocale + supportedLocales). Used to validate block.locales. */
    projectLocales?: string[];
}

export function validateLayout(layout: Layout, options?: ValidateLayoutOptions): ValidationResult {
    const result = createValidationResult();

    const issues = validateBlockInstances(layout?.blocks, 'blocks', {
        projectId: options?.projectId,
        allowHtmlIframe: options?.allowHtmlIframe === true,
        allowHtmlEmbed: options?.allowHtmlEmbed === true,
        projectLocales: options?.projectLocales,
        issuePrefix: 'layout'
    });

    for (const issue of issues) {
        addIssue(result, issue);
    }

    return result;
}
