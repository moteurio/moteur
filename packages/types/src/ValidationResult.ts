export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
    type: ValidationSeverity; // 'error' or 'warning
    code: string; // Unique identifier for the issue (e.g., 'invalid_field_value')
    message: string; // Human-readable description
    path?: string; // Optional JSON path (e.g., 'blocks[2].fields.title')
    hint?: string; // Optional suggestion to fix the issue
    context?: Record<string, any>; // Optional raw data related to the issue (e.g., the invalid value)
}

export interface ValidationResult {
    valid: boolean; // False if any errors exist
    issues: ValidationIssue[]; // List of issues (errors or warnings)
}
