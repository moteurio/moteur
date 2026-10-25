import type { VariantDefinition } from '@moteurio/types/VariantDefinition.js';
import type { ModelSchema } from '@moteurio/types/Model.js';
import type { User } from '@moteurio/types/User.js';

export type {
    PluginCommandSpec,
    PluginCommandArg,
    PluginCommandSurface
} from '@moteurio/types/PluginCommand.js';

export type MediaTransformContext = {
    projectId?: string;
    mimeType: string;
    /** Variant being built; omitted for source-buffer transforms. */
    variantKey?: string;
};

export type MediaTransform = {
    id: string;
    label: string;
    /** Default: image/* */
    mimeTypes?: string[];
    /** Run on each generated copy instead of the uploaded file. */
    perVariant?: boolean;
    apply: (bytes: Uint8Array, ctx: MediaTransformContext) => Promise<Uint8Array> | Uint8Array;
};

export type MediaVariantPreset = {
    id: string;
    label: string;
    variants: VariantDefinition[];
};

export type MediaGeneratorResult = {
    bytes: Uint8Array;
    filename: string;
    mimeType: string;
};

export type MediaGenerator = {
    id: string;
    label: string;
    mimeType: string;
    generate: (input: {
        projectId: string;
        params: Record<string, unknown>;
    }) => Promise<MediaGeneratorResult> | MediaGeneratorResult;
};

export type GitCommitHookPayload = {
    projectId: string;
    paths: string[];
    message: string;
    user: User;
    commitHash?: string;
};

export type GitCommitHook = (payload: GitCommitHookPayload) => void | Promise<void>;

export type ModelTemplate = ModelSchema;
