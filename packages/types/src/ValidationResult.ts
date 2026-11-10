export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
    type: ValidationSeverity; // 'error' or 'warning'
    code: string; // Unique identifier for the kind of issue (for example 'invalid_field_value')
    message: string; // Human-readable description
    path?: string; // Location of the issue as a JSON path (for example 'blocks[2].fields.title')
    hint?: string; // Suggestion for fixing the issue
    context?: Record<string, any>; // Raw data related to the issue, such as the invalid value
}

export interface ValidationResult {
    valid: boolean; // False when any issue is an error
    issues: ValidationIssue[]; // All issues, both errors and warnings
}
