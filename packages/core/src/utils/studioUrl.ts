/** Returns the base URL of the admin web app, used for links in emails. It comes from `STUDIO_URL` and is undefined when that is not set to an http(s) URL. */
export function studioUrl(): string | undefined {
    const url = process.env.STUDIO_URL?.trim().replace(/\/+$/, '');
    return url && /^https?:\/\//.test(url) ? url : undefined;
}
