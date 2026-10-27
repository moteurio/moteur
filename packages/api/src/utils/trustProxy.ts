/**
 * Express's `trust proxy` from TRUST_PROXY: who may say which address a request came from.
 * Behind a proxy (Fly, a load balancer), every request arrives from the proxy, so rate limits
 * keyed on the address would lump all visitors together; trusting the proxy gives each its own.
 *
 * - unset or `0`: no proxy, the connection's address counts (the default)
 * - a number: that many proxies in front (Fly: `1`)
 * - addresses or subnets, comma-separated, or Express's names (`loopback`, `uniquelocal`)
 *
 * `true` is refused: it would believe X-Forwarded-For from anyone, so each request could pick
 * its own address and step around every limit.
 */
export function trustProxySetting(value: string | undefined): number | string[] | false {
    const raw = (value ?? '').trim();
    if (raw === '' || raw === '0' || raw.toLowerCase() === 'false') return false;
    if (/^\d+$/.test(raw)) return parseInt(raw, 10);
    if (raw.toLowerCase() === 'true') {
        throw new Error(
            'TRUST_PROXY=true would trust any client to name its own address. Set the number of proxies in front (Fly: 1) or their addresses.'
        );
    }
    return raw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}
