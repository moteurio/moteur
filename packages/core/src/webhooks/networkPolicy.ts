import dns from 'node:dns/promises';
import { isIPv4, isIPv6 } from 'node:net';

function isHttpsOrLocalhost(urlStr: string): boolean {
    try {
        const u = new URL(urlStr);
        if (u.protocol === 'https:') return true;
        if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) {
            return process.env.NODE_ENV !== 'production';
        }
        return false;
    } catch {
        return false;
    }
}

function ipv4ToUint32(ip: string): number {
    const parts = ip.split('.');
    if (parts.length !== 4) throw new Error('Invalid IPv4');
    let n = 0;
    for (const p of parts) {
        const o = Number(p);
        if (!Number.isInteger(o) || o < 0 || o > 255) throw new Error('Invalid IPv4');
        n = (n << 8) | o;
    }
    return n >>> 0;
}

/** RFC 1918, loopback, link-local, CGNAT, and common SSRF targets. When allowLoopback, 127.0.0.0/8 is allowed. */
function isRestrictedIpv4Uint32(n: number, allowLoopback: boolean): boolean {
    if (allowLoopback && n >>> 24 === 127) return false;
    if (n >>> 24 === 0 || n >>> 24 >= 224) return true;
    if (n >>> 8 === 0xc00000 || n >>> 8 === 0xc00002) return true;
    if (n >= 0xc6120000 && n <= 0xc613ffff) return true;
    if (n >>> 8 === 0xc63364 || n >>> 8 === 0xcb0071) return true;
    if (n >>> 24 === 10) return true;
    if (n >= 0xac10_0000 && n <= 0xac1f_ffff) return true;
    if (n >>> 16 === 0xc0a8) return true;
    if (n >>> 16 === 0xa9fe) return true;
    if (n >= 0x6440_0000 && n <= 0x647f_ffff) return true;
    if (n >>> 24 === 127) return true;
    return false;
}

function expandIpv6ForCheck(ip: string): string {
    const lower = ip.toLowerCase();
    if (lower.includes('.')) {
        const idx = lower.lastIndexOf(':');
        const v4str = lower.slice(idx + 1);
        const prefix = lower.slice(0, idx);
        const n = ipv4ToUint32(v4str);
        const tail =
            ((n >>> 16) & 0xffff).toString(16).padStart(4, '0') +
            ':' +
            (n & 0xffff).toString(16).padStart(4, '0');
        return expandIpv6Only(prefix ? `${prefix}:${tail}` : `::${tail}`);
    }
    return expandIpv6Only(lower);
}

function expandIpv6Only(ip: string): string {
    const lower = ip.toLowerCase();
    const [head, tail = ''] = lower.includes('::') ? lower.split('::', 2) : [lower, ''];
    const left = head ? head.split(':').filter(Boolean) : [];
    const right = tail ? tail.split(':').filter(Boolean) : [];
    const missing = 8 - left.length - right.length;
    if (missing < 0) throw new Error('Invalid IPv6');
    const parts = [...left, ...Array(missing).fill('0'), ...right];
    return parts.map(p => p.padStart(4, '0')).join(':');
}

function isRestrictedIpv6(ip: string, allowLoopback: boolean): boolean {
    const v4m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
    if (v4m) {
        try {
            return isRestrictedIpv4Uint32(ipv4ToUint32(v4m[1]!), allowLoopback);
        } catch {
            return true;
        }
    }
    if (ip.toLowerCase() === '::1') return !allowLoopback;
    let expanded: string;
    try {
        expanded = expandIpv6ForCheck(ip);
    } catch {
        return true;
    }
    const first = parseInt(expanded.split(':')[0]!, 16);
    // Only global unicast; also excludes unspecified, IPv4-mapped and compatible forms.
    if (first < 0x2000 || first > 0x3fff) return true;
    // Transition mechanisms can tunnel an otherwise restricted IPv4 destination.
    if (first === 0x2002 || expanded.startsWith('2001:0000:')) return true;
    if (expanded.startsWith('2001:0db8:')) return true;
    return false;
}

function isRestrictedAddress(address: string, family: 4 | 6, allowLoopback: boolean): boolean {
    if (family === 4) {
        try {
            return isRestrictedIpv4Uint32(ipv4ToUint32(address), allowLoopback);
        } catch {
            return true;
        }
    }
    return isRestrictedIpv6(address, allowLoopback);
}

function devLocalHttpAllowsLoopback(u: URL): boolean {
    return (
        process.env.NODE_ENV !== 'production' &&
        u.protocol === 'http:' &&
        (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
    );
}

/** IPv6 literals in URLs are often `::1` without brackets; some parsers keep `[::1]` — normalize for net.isIPv* and dns. */
function normalizedHostname(u: URL): string {
    const h = u.hostname;
    if (h.startsWith('[') && h.endsWith(']')) {
        return h.slice(1, -1);
    }
    return h;
}

export async function resolveWebhookTarget(
    u: URL,
    what = 'Webhook URL'
): Promise<{ address: string; family: number }> {
    const allowLoopback = devLocalHttpAllowsLoopback(u);
    const host = normalizedHostname(u);
    let records: { address: string; family: number }[];
    if (isIPv4(host)) {
        records = [{ address: host, family: 4 }];
    } else if (isIPv6(host)) {
        records = [{ address: host, family: 6 }];
    } else {
        try {
            records = await dns.lookup(host, { all: true, verbatim: true });
        } catch {
            throw new Error(`${what} host could not be resolved`);
        }
    }
    if (records.length === 0) {
        throw new Error(`${what} host could not be resolved`);
    }
    for (const { address, family } of records) {
        if (isRestrictedAddress(address, family as 4 | 6, allowLoopback)) {
            throw new Error(
                `${what} resolves to a private or restricted network address, which is not allowed`
            );
        }
    }
    return records[0]!;
}

export async function validateUrl(url: string): Promise<{ address: string; family: number }> {
    if (!url || typeof url !== 'string') throw new Error('URL is required');
    if (!isHttpsOrLocalhost(url)) {
        throw new Error('URL must be HTTPS (or HTTP localhost in development only)');
    }
    return resolveWebhookTarget(new URL(url.trim()));
}

/**
 * For any server-side fetch of an address a client gave (a provider's file, a picture): HTTPS
 * only, and never a private or restricted network address. Same rules as webhook targets.
 */
export async function assertPublicHttpsUrl(url: string, what = 'URL'): Promise<void> {
    let u: URL;
    try {
        u = new URL(url.trim());
    } catch {
        throw new Error(`${what} is not a valid address`);
    }
    if (u.protocol !== 'https:') throw new Error(`${what} must be HTTPS`);
    await resolveWebhookTarget(u, what);
}
