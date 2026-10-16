import type { User } from '@moteurio/types/User.js';
import { render, type RenderFormat } from '../art/render.js';
import type { UploadedArt } from './prepare.js';

/** A generated file for the media library, referenced from content as `{ art: key }`. */
export type ArtSpec = {
    key: string;
    filename: string;
    alt: Record<string, string>;
    folder?: string;
    credit?: string;
} & (
    | { svg: () => string; format: Exclude<RenderFormat, 'svg'> }
    | { file: () => Buffer | Promise<Buffer>; mimeType: string }
);

const MIME: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg' };

/** Render and upload every spec through core's asset service. */
export async function uploadArt(
    projectId: string,
    user: User,
    specs: ArtSpec[],
    onUpload: (spec: ArtSpec) => void = () => {}
): Promise<Map<string, UploadedArt>> {
    const { uploadAsset } = await import('@moteurio/core/assets/assetService.js');
    const uploaded = new Map<string, UploadedArt>();
    for (const spec of specs) {
        const buffer = 'svg' in spec ? await render(spec.svg(), spec.format) : await spec.file();
        const mimeType = 'svg' in spec ? MIME[spec.format] : spec.mimeType;
        const asset = await uploadAsset(
            projectId,
            user,
            { buffer, originalName: spec.filename, mimeType },
            {
                title: spec.alt.en ?? spec.alt.fr,
                alt: spec.alt.fr ?? spec.alt.en,
                ...(spec.credit && { credit: spec.credit }),
                ...(spec.folder && { folder: spec.folder })
            }
        );
        uploaded.set(spec.key, {
            assetId: asset.id,
            url: asset.variants?.find(v => v.key === 'large')?.url ?? asset.localUrl ?? '',
            alt: spec.alt,
            ...(spec.credit && { credit: spec.credit })
        });
        onUpload(spec);
    }
    return uploaded;
}
