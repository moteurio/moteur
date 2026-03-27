import type { OpenAPIV3 } from 'openapi-types';

const baseSchemas: OpenAPIV3.ComponentsObject['schemas'] = {
    User: {
        type: 'object',
        required: ['id', 'email'],
        description: 'Authenticated user (`/auth/me`, login). Never includes `passwordHash`.',
        properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            name: { type: 'string', description: 'Display name' },
            avatar: { type: 'string', description: 'Public avatar path or absolute URL' },
            roles: {
                type: 'array',
                items: { type: 'string' }
            },
            projects: {
                type: 'array',
                items: { type: 'string' }
            },
            isActive: { type: 'boolean' },
            lastLoginAt: {
                type: 'string',
                format: 'date-time',
                description: 'ISO 8601; set on successful password or OAuth sign-in'
            }
        }
    },
    /** Project-scoped list entry for `/projects/{projectId}/users` (no secrets). */
    ProjectMemberUser: {
        type: 'object',
        required: ['id', 'email', 'roles', 'isActive', 'online'],
        properties: {
            id: { type: 'string' },
            name: { type: 'string', nullable: true },
            email: { type: 'string' },
            avatar: { type: 'string', nullable: true },
            roles: { type: 'array', items: { type: 'string' } },
            isActive: { type: 'boolean' },
            lastLoginAt: {
                type: 'string',
                format: 'date-time',
                nullable: true,
                description: 'Last successful sign-in (password or OAuth)'
            },
            online: {
                type: 'boolean',
                description:
                    'True when the user has active Studio presence in this project within ONLINE_PRESENCE_MAX_IDLE_MS (default 90000 ms)'
            }
        }
    },
    ProjectMemberPatchBody: {
        type: 'object',
        description:
            'Partial update (platform operator / `admin` role only). At least one field required.',
        properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            isActive: { type: 'boolean' },
            roles: { type: 'array', items: { type: 'string' } },
            avatar: { type: 'string', description: 'URL/path, or empty string to clear' }
        }
    },
    Project: {
        type: 'object',
        required: ['id', 'label'],
        properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            description: { type: 'string' },
            plugins: {
                type: 'array',
                items: { type: 'string' }
            }
        }
    },
    Model: {
        type: 'object',
        required: ['id', 'label', 'fields'],
        properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            description: { type: 'string' },
            fields: {
                type: 'object',
                additionalProperties: {
                    $ref: '#/components/schemas/Field'
                }
            },
            meta: {
                type: 'object',
                additionalProperties: true
            }
        }
    },
    Field: {
        type: 'object',
        required: ['type'],
        properties: {
            type: { type: 'string' },
            label: { type: 'string' },
            required: { type: 'boolean' },
            options: {
                type: 'object',
                additionalProperties: true
            },
            meta: {
                type: 'object',
                additionalProperties: true
            }
        }
    },
    ValidationResult: {
        type: 'object',
        required: ['valid', 'errors'],
        properties: {
            valid: { type: 'boolean', example: false },
            errors: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['field', 'message'],
                    properties: {
                        field: { type: 'string' },
                        message: { type: 'string' }
                    }
                }
            }
        }
    },
    ErrorResponse: {
        type: 'object',
        required: ['error'],
        properties: {
            error: { type: 'string' },
            requestId: {
                type: 'string',
                description: 'Correlation id (also in x-request-id response header)'
            },
            details: {
                type: 'string',
                description: 'Present in non-production for some errors'
            }
        }
    },
    EntryCreateBody: {
        type: 'object',
        required: ['id', 'type', 'data'],
        description: 'New entry payload (validated against the model schema server-side).',
        properties: {
            id: { type: 'string' },
            type: { type: 'string' },
            data: { type: 'object', additionalProperties: true },
            status: {
                type: 'string',
                enum: ['draft', 'in_review', 'published', 'unpublished']
            },
            meta: { type: 'object', additionalProperties: true }
        }
    },
    /** Persisted entry as returned by the API (`data` follows the model schema). */
    Entry: {
        type: 'object',
        required: ['id', 'type', 'data'],
        properties: {
            id: { type: 'string' },
            type: { type: 'string', description: 'Model id' },
            data: { type: 'object', additionalProperties: true },
            status: {
                type: 'string',
                enum: ['draft', 'in_review', 'published', 'unpublished']
            },
            meta: { type: 'object', additionalProperties: true },
            options: { type: 'object', additionalProperties: true },
            resolvedUrl: {
                type: 'string',
                nullable: true,
                description: 'Canonical URL when `resolveUrl=1` was used'
            }
        }
    },
    EntriesListResponse: {
        type: 'object',
        required: ['entries'],
        properties: {
            entries: { type: 'array', items: { $ref: '#/components/schemas/Entry' } }
        }
    },
    EntryOneResponse: {
        type: 'object',
        required: ['entry'],
        properties: {
            entry: { $ref: '#/components/schemas/Entry' }
        }
    },
    EntryRevision: {
        type: 'object',
        required: ['id', 'number', 'message', 'savedAt', 'savedBy'],
        properties: {
            id: { type: 'string' },
            number: { type: 'integer' },
            message: { type: 'string' },
            savedAt: { type: 'string', format: 'date-time' },
            savedBy: { type: 'string' }
        }
    },
    ApiCollectionResource: {
        type: 'object',
        required: ['resourceType', 'resourceId'],
        properties: {
            resourceType: {
                type: 'string',
                enum: ['model', 'page', 'layout', 'form']
            },
            resourceId: { type: 'string' },
            fields: { type: 'array', items: { type: 'string' } },
            filters: {
                type: 'object',
                properties: {
                    status: {
                        description: 'Single status or list of allowed statuses',
                        oneOf: [
                            {
                                type: 'string',
                                enum: ['draft', 'in_review', 'published', 'unpublished']
                            },
                            {
                                type: 'array',
                                items: {
                                    type: 'string',
                                    enum: ['draft', 'in_review', 'published', 'unpublished']
                                }
                            }
                        ]
                    },
                    locale: { type: 'string' }
                }
            },
            resolve: { type: 'integer', enum: [0, 1, 2] }
        }
    },
    ApiCollection: {
        type: 'object',
        required: ['id', 'projectId', 'label', 'resources', 'createdAt', 'updatedAt'],
        properties: {
            id: { type: 'string' },
            projectId: { type: 'string' },
            label: { type: 'string' },
            description: { type: 'string' },
            resources: {
                type: 'array',
                items: { $ref: '#/components/schemas/ApiCollectionResource' }
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
        }
    },
    CollectionPageNode: {
        type: 'object',
        description: 'Page tree node (folder or page). Fields depend on node type.',
        additionalProperties: true
    },
    /** Form document as stored in the project (fields depend on project configuration). */
    FormSchemaDoc: {
        type: 'object',
        additionalProperties: true,
        description: 'Form definition JSON (id, fields, etc.)'
    },
    FormsListResponse: {
        type: 'object',
        required: ['forms'],
        properties: {
            forms: { type: 'array', items: { $ref: '#/components/schemas/FormSchemaDoc' } }
        }
    },
    FormOneResponse: {
        type: 'object',
        required: ['form'],
        properties: {
            form: { $ref: '#/components/schemas/FormSchemaDoc' }
        }
    },
    FormSubmissionsListResponse: {
        type: 'object',
        required: ['submissions'],
        properties: {
            submissions: { type: 'array', items: { $ref: '#/components/schemas/JsonRecord' } }
        }
    },
    FormSubmissionOneResponse: {
        type: 'object',
        required: ['submission'],
        properties: {
            submission: { $ref: '#/components/schemas/JsonRecord' }
        }
    },
    ApiKeyGenerateResponse: {
        type: 'object',
        properties: {
            prefix: { type: 'string' },
            rawKey: { type: 'string' },
            message: { type: 'string' }
        }
    },
    ApiKeyMetaResponse: {
        type: 'object',
        properties: {
            prefix: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time', nullable: true }
        }
    },
    UsageCounts: {
        type: 'object',
        required: ['studio', 'public'],
        properties: {
            studio: {
                type: 'object',
                required: ['total', 'windowStart'],
                properties: {
                    total: { type: 'number' },
                    windowStart: { type: 'number' }
                }
            },
            public: {
                type: 'object',
                required: ['byProject'],
                properties: {
                    byProject: {
                        type: 'object',
                        additionalProperties: {
                            type: 'object',
                            required: ['total', 'windowStart'],
                            properties: {
                                total: { type: 'number' },
                                windowStart: { type: 'number' }
                            }
                        }
                    }
                }
            }
        }
    },
    AiGenerateEntrySuccess: {
        type: 'object',
        required: ['success', 'entry', 'creditsUsed', 'creditsRemaining'],
        properties: {
            success: { type: 'boolean' },
            entry: { type: 'object', additionalProperties: true },
            creditsUsed: { type: 'number' },
            creditsRemaining: { type: 'number' }
        }
    },
    AiInsufficientCreditsError: {
        type: 'object',
        properties: {
            error: { type: 'string' },
            message: { type: 'string' }
        }
    },
    AiGenerateFieldsSuccess: {
        type: 'object',
        required: ['fields'],
        properties: {
            fields: { type: 'object', additionalProperties: true }
        }
    },
    AiImageVariant: {
        type: 'object',
        properties: {
            url: { type: 'string' },
            width: { type: 'number' },
            height: { type: 'number' }
        }
    },
    AiGenerateImageSuccess: {
        type: 'object',
        properties: {
            variants: {
                type: 'array',
                items: { $ref: '#/components/schemas/AiImageVariant' }
            },
            prompt: { type: 'string' },
            creditsUsed: { type: 'number' },
            creditsRemaining: { type: 'number' }
        }
    },
    /** Generic JSON object when the shape is resource-specific. */
    JsonRecord: {
        type: 'object',
        additionalProperties: true
    },
    /** Map of block type id → block schema JSON. */
    BlockDefinitionsMap: {
        type: 'object',
        additionalProperties: { type: 'object', additionalProperties: true }
    },
    /** Result of validating a page or template (`@moteurio/types` ValidationResult). */
    /** Entry in sitemap.json / urls responses (shape may include locale, changefreq, etc.). */
    ResolvedUrlEntry: {
        type: 'object',
        additionalProperties: true,
        properties: {
            url: { type: 'string' }
        }
    },
    /** Navigation tree from GET .../navigation */
    NavigationTree: {
        type: 'array',
        items: { type: 'object', additionalProperties: true }
    },
    BreadcrumbPayload: {
        type: 'object',
        properties: {
            url: { type: 'string' },
            breadcrumb: {
                type: 'array',
                items: { type: 'object', additionalProperties: true }
            }
        },
        additionalProperties: true
    },
    PageValidationResult: {
        type: 'object',
        required: ['valid', 'issues'],
        properties: {
            valid: { type: 'boolean' },
            issues: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['type', 'code', 'message'],
                    properties: {
                        type: { type: 'string', enum: ['error', 'warning'] },
                        code: { type: 'string' },
                        message: { type: 'string' },
                        path: { type: 'string' },
                        hint: { type: 'string' },
                        context: { type: 'object', additionalProperties: true }
                    }
                }
            }
        }
    },
    Review: {
        type: 'object',
        required: ['id', 'projectId', 'status', 'requestedBy', 'requestedByName', 'createdAt'],
        properties: {
            id: { type: 'string' },
            projectId: { type: 'string' },
            modelId: { type: 'string' },
            entryId: { type: 'string' },
            resourceType: { type: 'string', enum: ['entry', 'page'] },
            templateId: { type: 'string' },
            pageId: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
            requestedBy: { type: 'string' },
            requestedByName: { type: 'string' },
            assignedTo: { type: 'string' },
            reviewedBy: { type: 'string' },
            reviewedByName: { type: 'string' },
            rejectionCommentId: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            resolvedAt: { type: 'string', format: 'date-time' }
        }
    },
    Presence: {
        type: 'object',
        properties: {
            userId: { type: 'string' },
            name: { type: 'string' },
            avatarUrl: { type: 'string', nullable: true },
            projectId: { type: 'string' },
            screenId: { type: 'string', nullable: true },
            collaborationMode: { type: 'string', enum: ['shared', 'exclusive'], nullable: true },
            entryId: { type: 'string', nullable: true },
            fieldPath: { type: 'string', nullable: true },
            overlayId: { type: 'string', nullable: true },
            typing: { type: 'boolean', nullable: true },
            textPreview: { type: 'string', nullable: true },
            cursor: {
                type: 'object',
                nullable: true,
                properties: {
                    x: { type: 'number' },
                    y: { type: 'number' }
                }
            },
            pointerPulse: { type: 'number', nullable: true },
            updatedAt: { type: 'number' }
        },
        required: ['userId', 'name', 'projectId', 'updatedAt']
    },
    RadarViolation: {
        type: 'object',
        required: ['id', 'ruleId', 'severity', 'entrySlug', 'modelSlug', 'message', 'detectedAt'],
        properties: {
            id: { type: 'string' },
            ruleId: { type: 'string' },
            severity: { type: 'string', enum: ['error', 'warning', 'suggestion'] },
            entrySlug: { type: 'string' },
            modelSlug: { type: 'string' },
            fieldPath: { type: 'string', nullable: true },
            locale: { type: 'string', nullable: true },
            message: { type: 'string' },
            hint: { type: 'string', nullable: true },
            aiAction: {
                type: 'object',
                nullable: true,
                properties: {
                    feature: { type: 'string', enum: ['translation', 'writing', 'image-analysis'] },
                    label: { type: 'string' },
                    action: { type: 'string' }
                }
            },
            aiEnhancement: {
                type: 'object',
                nullable: true,
                properties: {
                    label: { type: 'string' },
                    description: { type: 'string' },
                    credits: { type: 'integer' },
                    action: { type: 'string' }
                }
            },
            detectedAt: { type: 'string', format: 'date-time' },
            resolvedAt: { type: 'string', format: 'date-time', nullable: true }
        }
    },
    RadarReportSummary: {
        type: 'object',
        required: ['errors', 'warnings', 'suggestions', 'total'],
        properties: {
            errors: { type: 'integer' },
            warnings: { type: 'integer' },
            suggestions: { type: 'integer' },
            total: { type: 'integer' }
        }
    },
    RadarReport: {
        type: 'object',
        required: ['scannedAt', 'summary', 'violations'],
        properties: {
            scannedAt: { type: 'string', format: 'date-time' },
            summary: { $ref: '#/components/schemas/RadarReportSummary' },
            violations: {
                type: 'array',
                items: { $ref: '#/components/schemas/RadarViolation' }
            }
        }
    }
};

// You can dynamically generate this if needed
export const baseSpec: OpenAPIV3.Document = {
    openapi: '3.0.0',
    info: {
        title: 'Moteur API',
        version: '1.0.0',
        description: 'REST API for the Moteur content engine'
    },
    paths: {}, // plugins and core will add to this
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer'
            },
            apiKeyAuth: {
                type: 'apiKey',
                in: 'header',
                name: 'x-api-key',
                description: 'Project read-only API key (collections, page outputs, radar)'
            }
        },
        schemas: baseSchemas
    },
    security: [{ bearerAuth: [] }]
};
