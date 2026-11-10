import { URL } from 'url';

/**
 * The server clones from and pushes to a project's Git remote using its own filesystem and keys,
 * so a project's remote must be an `https://` address. A local path, `file://` or SSH address could reach
 * another project's repository on the host. No user role can override this.
 */
export function gitRemoteRefusal(git: { remoteUrl?: unknown } | null | undefined): string | null {
    const remote = typeof git?.remoteUrl === 'string' ? git.remoteUrl.trim() : '';
    if (!remote) return null;
    let url: URL;
    try {
        url = new URL(remote);
    } catch {
        // Not a valid URL, so it is a local path or an scp-style SSH address.
        return 'Git remote must be an https:// address';
    }
    if (url.protocol !== 'https:') return 'Git remote must be an https:// address';
    // The address is saved in project.json, which every save commits and pushes, so credentials in it would be published.
    if (url.username || url.password)
        return 'Git remote must not contain a password or token: it would be committed with the project';
    return null;
}
