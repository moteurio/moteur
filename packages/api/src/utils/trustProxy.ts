/**
 * Builds Express's `trust proxy` setting from TRUST_PROXY, which controls whose claim about a request's
 * client address is believed. Behind a proxy (Fly, a load balancer) every request arrives from the proxy,
 * so rate limits keyed on the address would treat all visitors as one. Trusting the proxy gives each
 * visitor their own address.
 *
 * - unset or `0`: no proxy, so the connection's address is used (the default)
 * - a number: that many proxies in front (Fly: `1`)
 * - addresses or subnets, comma-separated, or Express's names (`loopback`, `uniquelocal`)
 *
 * `true` is refused because it would trust X-Forwarded-For from anyone, so each request could choose
 * its own address and bypass every limit.
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
