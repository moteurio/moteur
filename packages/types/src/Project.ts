import type { AssetType, VideoProviderId } from './Asset.js';
import type { VariantDefinition } from './VariantDefinition.js';
import { Audit } from './Audit.js';
import { Field } from './Field.js';

export type LocalePrefix = 'others' | 'all' | 'none';

/** A project to create. When `workspaceId` is omitted, the project is created in the creator's personal workspace. */
export type NewProject = Omit<ProjectSchema, 'workspaceId'> & { workspaceId?: string };

export interface ProjectSchema {
    id: string; // Unique project ID (same as the folder name)
    /**
     * Set on a copy of the server's demo project, which exists to give a user a tour. A demo copy
     * serves no site (it has no API keys and accepts no form submissions from sites) and does not
     * count as the user's free project (a host can assign it a plan through the
     * `project.demoCopied` event). It is moved to the trash after 30 days without changes unless
     * the user keeps it with `POST /projects/:id/keep`.
     */
    demo?: { from: string; copiedAt: string };
    /**
     * ID of the workspace (`Workspace`) that owns this project: the team that manages and pays for
     * it. Set when the project is created. Moving the project to another workspace transfers
     * ownership.
     */
    workspaceId: string;
    label: string; // Display name
    description?: string; // Optional description
    defaultLocale: string; // Default locale, used as the fallback for missing translations
    supportedLocales?: string[]; // Locales supported in addition to the default locale

    /** When true, the project is active and available for use. New projects are created with isActive: true. */
    isActive?: boolean;

    /**
     * IDs of the users added to this project directly, including guests such as a client who can
     * access only this project. Members of the project's workspace can have access without being
     * listed here (see `Workspace`).
     */
    users?: string[];

    /**
     * Roles per user on this project, keyed by user ID. A user listed here has these roles in this
     * project instead of the roles their workspace or account would give them. A workspace Owner or
     * Admin keeps their workspace roles as well. Users not listed keep their workspace or account
     * roles. Set with `PATCH /projects/:projectId/users/:userId`, not through a project update.
     */
    memberRoles?: Record<string, string[]>;

    /**
     * IDs of the optional plugins enabled for this project.
     * When unset, all optional plugins enabled on the server apply. When set, only the listed
     * plugins run for this project. Optional plugins are enabled on the server through
     * MOTEUR_OPTIONAL_PLUGINS.
     */
    plugins?: string[];

    namespaces?: string[]; // Namespaces defined for this project

    workflow?: {
        enabled: boolean; // Defaults to false
        mode: 'auto_publish'; // Approving a review publishes the content automatically
        requireReview: boolean; // When true, authors cannot publish without an approved review. Users with the Content lead role (including admins) can publish without one.
    };

    /** Base URL of the site (for example `https://example.com`). Used for sitemap `<loc>` values. When absent, the sitemap uses path-only URLs. */
    siteUrl?: string;

    /**
     * Branding for emails the project sends to its site's visitors, such as form confirmations
     * and form notifications. They use the project's sender name, logo and accent colour instead
     * of the server's. Set with `PATCH /projects/:projectId/email`, not through a project update.
     */
    email?: ProjectEmailSettings;

    /**
     * URL of the site's preview route, which renders pages in their current draft state (for
     * example `https://example.com/preview`). Admin clients open drafts there, appending the
     * page's path and a short-lived `?preview=` token. Defaults to `siteUrl`, which suits a site
     * that renders on request.
     */
    previewUrl?: string;

    /**
     * Controls whether page URLs include a locale prefix. `others` (default): only non-default
     * locales have a prefix (`/about`, `/fr/a-propos`). `all`: every locale has a prefix
     * (`/en/about`). `none`: no locale has a prefix and locales are distinguished by their slugs
     * alone (`/about`, `/a-propos`).
     */
    localePrefix?: LocalePrefix;

    /**
     * When true, core/html fields may include iframe tags (subject to the field's `allowedTags`).
     * Defaults to false.
     */
    allowHtmlIframe?: boolean;

    /**
     * When true, core/html fields may include embed, object and param tags (subject to the
     * field's `allowedTags`). Defaults to false.
     */
    allowHtmlEmbed?: boolean;

    /**
     * Public API keys for this project. Raw secrets are never stored; each entry holds only a hash
     * and a prefix.
     */
    apiKeys?: ProjectApiKeyEntry[];

    /** Media settings: upload limits, image variants and storage adapter. When `enabled` is false, uploads and media features are disabled for this project. */
    assetConfig?: {
        enabled?: boolean; // Defaults to true when assetConfig is present
        variants: VariantDefinition[];
        maxUploadSizeMb?: number; // Maximum upload size in megabytes. Defaults to 50
        allowedTypes?: AssetType[]; // Accepted asset types. Defaults to all types
        adapter?: 'local' | 's3' | 'r2' | 'minio' | 'cloudinary';
        adapterConfig?: Record<string, any>;
    };

    /** Third-party integrations. Credentials are redacted in public project payloads. */
    integrations?: {
        shopify?: {
            /** Store hostname, e.g. `mybrand.myshopify.com`. */
            shop: string;
            /** Admin API access token, from a custom app or OAuth. */
            accessToken?: string;
            /** ID of the entry model that products synced from Shopify are stored in. */
            productModelId?: string;
        };
    };

    meta?: {
        audit?: Audit;
    };

    /** Git settings. When `enabled` is false, Git operations (push, pull, sync) are disabled for this project. */
    git?: {
        enabled?: boolean; // Defaults to true when the git config is present
        /** Remote repository URL. When set at creation, the project is created by cloning this repository instead of initializing a new one. */
        remoteUrl?: string;
    };

    /** AI settings. When `enabled` is false, all AI features (writing, image generation, analysis, translation) are disabled for this project. */
    ai?: {
        enabled?: boolean; // Defaults to true when the ai config is present
        /**
         * AI helpers that users can request. A helper is available only when set to true here, so
         * a project without AI settings offers none.
         */
        helpers?: Partial<Record<AiHelper, boolean>>;
        /** Roles allowed to request helpers. Defaults to `DEFAULT_AI_ROLES` (admin and writer). A translator can always request a translation. */
        roles?: string[];
        /** When true, AI-assisted changes are marked as such in history and review for all users. By default only admins and reviewers see the marker. */
        provenanceForAll?: boolean;
        /** When true, image analysis (alt text and caption) runs automatically after each image upload. Defaults to false. */
        autoAnalyseImages?: boolean;
        /** Image generation provider (`openai` for DALL-E, `google` for Gemini, `fal` or `replicate`), or null when not set. */
        imageProvider?: 'openai' | 'google' | 'fal' | 'replicate' | null;
        /** Text-to-speech and audio generation provider, or null when not set. */
        audioProvider?: 'elevenlabs' | 'fal' | null;
        /** Text-to-3D model generation provider, or null when not set. */
        model3dProvider?: 'meshy' | 'fal' | null;
        /** True once a user has seen and accepted the licensing notice for generated images. */
        imageGenerationAcknowledged?: boolean;
    };

    /** Presence settings (real-time editor presence and form state). When `enabled` is false, the presence socket and related features are disabled for this project. */
    presence?: {
        enabled?: boolean; // Defaults to true when the presence config is present
        /** Collaboration mode that admin clients use when the user has not chosen one for their session. */
        collaborationModeDefault?: 'shared' | 'exclusive';
    };

    /** Video provider settings for this project (Mux, Vimeo, Cloudflare Stream, YouTube). When set, video uploads use this project's credentials. */
    videoProviders?: VideoProvidersConfig;

    /**
     * Content areas that admin clients show in their navigation. A key set to false hides that
     * area; an omitted key shows it. Some areas depend on others: with `models` off, entries,
     * taxonomy and settings are hidden; with `pages` off, pages and templates are hidden; with
     * `forms` off, forms, submissions and user-data entries are hidden.
     */
    contentFeatures?: {
        pages?: boolean;
        navigations?: boolean;
        entries?: boolean;
        layouts?: boolean;
        media?: boolean;
        taxonomy?: boolean;
        settings?: boolean;
        models?: boolean;
        blueprints?: boolean;
        blocks?: boolean;
        forms?: boolean;
    };
}

/** Sender and appearance settings for a project's outgoing email. Every key is optional. */
export interface ProjectEmailSettings {
    /** Sender name shown in recipients' inboxes. Defaults to the project's name. */
    senderName?: string;
    /** Address that replies are sent to, usually the project's contact address. When unset, replies go to the From address. */
    replyTo?: string;
    /** From address. It must be on a domain the server operator allows; otherwise the server's address is used. */
    fromAddress?: string;
    /** ID of an asset in the project's media (PNG, JPEG or GIF, at most 100 KB) that is embedded in each email as the logo. */
    logoAssetId?: string;
    /** HTTPS URL of the logo image, for when the logo is not in the project's media. */
    logoUrl?: string;
    /** Logo width in pixels, from 24 to 300. Defaults to 120. */
    logoWidth?: number;
    /** Colour for buttons and links, as `#RRGGBB`. White text on this colour must have a contrast ratio of at least 4.5:1. */
    accent?: string;
    /** Postal address or legal line shown in the footer of every email. */
    footer?: string;
    /** Site URL linked in the footer. Defaults to the project's `siteUrl`. */
    siteUrl?: string;
}

/** Stored metadata for one project API key. Only a hash of the secret is stored. */
export interface ProjectApiKeyEntry {
    id: string;
    hash: string;
    prefix: string;
    createdAt: string;
    label?: string;
    /** ISO 8601 timestamp after which the key is rejected. When omitted, the key never expires. */
    expiresAt?: string;
    /**
     * When non-empty, requests authenticated with `x-api-key` must send an Origin or Referer
     * header whose hostname matches one entry (exactly, or through a single leading `*.`
     * wildcard). When empty or omitted, there is no host restriction.
     */
    allowedHosts?: string[];
    /**
     * When set, the key can read only these channel IDs. When omitted, the key can read all
     * channels.
     */
    allowedChannelIds?: string[];
    /**
     * Applies when `allowedChannelIds` is set. When true, the key can also read the sitemap,
     * navigation, urls, breadcrumb and radar endpoints. Defaults to false, which restricts the key
     * to its channels.
     */
    allowSiteWideReads?: boolean;
}

/** Video provider settings. Used per project (`project.videoProviders`) or as the instance-level fallback. */
export interface VideoProvidersConfig {
    active?: VideoProviderId;
    keepLocalCopy?: boolean;
    mux?: {
        tokenId: string;
        tokenSecret: string;
        webhookSecret: string;
    };
    vimeo?: {
        accessToken: string;
        webhookSecret: string;
    };
    cloudflareStream?: {
        accountId: string;
        apiToken: string;
        webhookSecret: string;
    };
    youtube?: {
        clientId: string;
        clientSecret: string;
        refreshToken: string;
    };
}

export const projectSchemaFields: Record<string, Field> = {
    id: {
        type: 'core/text',
        label: 'Project ID',
        description: 'Unique identifier for the project, typically the folder name.'
    },
    label: {
        type: 'core/text',
        label: 'Project Name',
        description: 'Human-readable name for the project.'
    },
    description: {
        type: 'core/text',
        label: 'Description',
        description: 'Optional description of the project.'
    },
    defaultLocale: {
        type: 'core/text',
        label: 'Default Locale',
        description: 'Default language for this project, used for fallbacks.'
    },
    supportedLocales: {
        type: 'core/list',
        label: 'Supported Locales',
        description: 'List of other supported languages for this project.',
        options: {
            itemType: 'core/text',
            allowEmpty: true,
            required: false
        }
    },
    users: {
        type: 'core/list',
        label: 'Authorized Users',
        description: 'Optional list of users authorized to access this project.',
        options: {
            itemType: 'core/text',
            allowEmpty: true,
            required: false
        }
    }
};

/** AI helpers that a project can enable individually. */
export type AiHelper = 'write' | 'translate' | 'alt' | 'notes' | 'images' | 'audio' | 'model3d';
export const AI_HELPERS: AiHelper[] = [
    'write',
    'translate',
    'alt',
    'notes',
    'images',
    'audio',
    'model3d'
];
export const DEFAULT_AI_ROLES = ['admin', 'writer'];
