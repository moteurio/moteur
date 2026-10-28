/** The Studio's address, for links in emails (`STUDIO_URL`), when the server knows it. */
export function studioUrl(): string | undefined {
    const url = process.env.STUDIO_URL?.trim().replace(/\/+$/, '');
    return url && /^https?:\/\//.test(url) ? url : undefined;
}
