import type { AssetType, VideoProviderId } from './Asset.js';
import type { VariantDefinition } from './VariantDefinition.js';
import { Audit } from './Audit.js';
import { Field } from './Field.js';

export interface ProjectSchema {
    id: string; // Unique project ID (same as folder name)
    label: string; // Human-readable name
    description?: string; // Optional description
    defaultLocale: string; // Default language for fallbacks
    supportedLocales?: string[]; // Other supported locales

    /** When true, the project is active and available for use. New projects are created with isActive: true. */
    isActive?: boolean;

    users?: string[]; // Optional list of authorized users

    /**
     * Plugin IDs enabled for this project (optional plugins only).
     * When unset, all server-enabled optional plugins apply. When set, only listed IDs run for this project.
     * Enable at server level via MOTEUR_OPTIONAL_PLUGINS; enable/disable per-project here.
     */
    plugins?: string[];

    namespaces?: string[]; // List of namespaces for this project

    workflow?: {
        enabled: boolean; // default false
        mode: 'auto_publish'; // reviewer approves → auto-publishes
        requireReview: boolean; // if true, authors cannot publish without approval; admins can always bypass
    };

    /** Base URL for the site (e.g. https://example.com). Used for sitemap <loc>; if absent, sitemap uses path-only URLs. */
    siteUrl?: string;

    /**
     * When true, core/html fields may include iframe tags (subject to field allowedTags). Default: off.
     */
    allowHtmlIframe?: boolean;

    /**
     * When true, core/html fields may include embed/object/param tags (subject to field allowedTags). Default: off.
     */
    allowHtmlEmbed?: boolean;

    /**
     * Public API keys for this project. Raw secrets are never stored; only hash and prefix per entry.
     */
    apiKeys?: ProjectApiKeyEntry[];

    /** Media/assets: upload limits, variants, storage adapter. When enabled is false, uploads and media features are disabled for this project. */
    assetConfig?: {
        enabled?: boolean; // default true when assetConfig present
        variants: VariantDefinition[];
        maxUploadSizeMb?: number; // default 50
        allowedTypes?: AssetType[]; // default: all three
        adapter?: 'local' | 's3' | 'r2';
        adapterConfig?: Record<string, any>;
    };

    meta?: {
        audit?: Audit;
    };

    /** Git feature config. When enabled is false, git operations (push/pull/sync) are disabled for this project. */
    git?: {
        enabled?: boolean; // default true when git config present
        /** Remote URL. When set at creation, the project is created by cloning this repo instead of init. */
        remoteUrl?: string;
    };

    /** AI-related project settings. When enabled is false, all AI features (writing, image gen, analysis, translation) are disabled for this project. */
    ai?: {
        enabled?: boolean; // default true when ai config present
        /** When true, run image analysis (alt/caption) automatically after each image upload. Default: false. */
        autoAnalyseImages?: boolean;
        /** Image generation provider: openai (DALL-E), fal, replicate, or null if not set. */
        imageProvider?: 'openai' | 'fal' | 'replicate' | null;
        /** When true, the licensing acknowledgement for generated images has been shown and accepted. */
        imageGenerationAcknowledged?: boolean;
    };

    /** Presence (real-time who's editing, form state). When enabled is false, presence socket and related features are disabled for this project. */
    presence?: {
        enabled?: boolean; // default true when presence config present
        /** Default collaboration mode in Studio when the user has no session override. */
        collaborationModeDefault?: 'shared' | 'exclusive';
    };

    /** Per-project video provider config (Mux, Vimeo, Cloudflare Stream, YouTube). When set, video uploads use this project's credentials. */
    videoProviders?: VideoProvidersConfig;

    /**
     * Content menu features to show in the admin sidebar. When a key is false, that item is hidden.
     * Omitted or undefined means show the item. Dependencies: models off → entries/taxonomy/settings hidden;
     * pages off → pages and templates hidden; forms off → forms, submissions, and user-data entries hidden.
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

/** Stored metadata for one project API key (secret is hash-only). */
export interface ProjectApiKeyEntry {
    id: string;
    hash: string;
    prefix: string;
    createdAt: string;
    label?: string;
    /**
     * When non-empty, x-api-key requests must send Origin or Referer whose hostname matches
     * one entry (exact or single leading *. wildcard). Empty or omitted = no host restriction.
     */
    allowedHosts?: string[];
    /**
     * When set, this key may only read these API collection (channel) IDs.
     * Omit the field for full access to all collections.
     */
    allowedCollectionIds?: string[];
    /**
     * When `allowedCollectionIds` is set, controls access to sitemap, navigation, urls, breadcrumb, radar.
     * Defaults to false (collection-only) unless explicitly true.
     */
    allowSiteWideReads?: boolean;
}

/** Video provider config. Can be per-project (project.videoProviders) or instance-level fallback. */
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
