/**
 * The map block (`geo/map`) on a site, drawn by the map library the site picks (Leaflet,
 * MapLibre, OpenLayers…): every one of them takes GeoJSON, and this turns the block into it.
 *
 * - `toGeoJSON(data, locale)`: the places, areas and routes, labels and colours in `properties`;
 * - `viewOf(data)`: where to look (the editor's centre and zoom, or the box around everything);
 * - `renderMap(data, locale)`: HTML that needs no library, the places as a list, each a link to a
 *   map: what a reader without the map (or with a screen reader) gets;
 * - `<moteur-geo-map>` draws the map with `useMapLibrary(draw)`, the list kept under it.
 */

export type MapBlock = { type?: string; data?: MapBlockData };

export type LngLat = [number, number];

export type MapBlockData = {
    center?: { lat?: number; lng?: number; label?: string };
    zoom?: number;
    fitToFeatures?: boolean;
    features?: {
        kind?: 'location' | 'area' | 'polyline' | string;
        location?: { lat?: number; lng?: number; label?: string };
        /** Rings of [lng, lat], each a closed shape. */
        area?: { polygons?: unknown };
        /** Ordered [lng, lat]. */
        polyline?: { points?: unknown };
        label?: Localized;
        color?: string;
    }[];
};

export type Localized = string | Record<string, string | undefined> | undefined;

type Geometry =
    | { type: 'Point'; coordinates: LngLat }
    | { type: 'MultiPolygon'; coordinates: LngLat[][][] }
    | { type: 'LineString'; coordinates: LngLat[] };

export type MapFeature = {
    type: 'Feature';
    geometry: Geometry;
    properties: { kind: 'location' | 'area' | 'polyline'; label: string; color?: string };
};

export type FeatureCollection = { type: 'FeatureCollection'; features: MapFeature[] };

/** Where to look: a centre and zoom, or a box (`[[west, south], [east, north]]`) to fit. */
export type MapView = { center?: LngLat; zoom?: number; bounds?: [LngLat, LngLat] };

const escapeHtml = (s: string) =>
    s.replace(
        /[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
    );

export function pick(value: Localized, locale?: string): string {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    const own = locale ? value[locale] : undefined;
    if (typeof own === 'string' && own) return own;
    return Object.values(value).find((v): v is string => typeof v === 'string' && v !== '') ?? '';
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const onEarth = (lng: unknown, lat: unknown): boolean =>
    finite(lng) && finite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;

function point(p: { lat?: number; lng?: number } | undefined): LngLat | undefined {
    return p && onEarth(p.lng, p.lat) ? [p.lng!, p.lat!] : undefined;
}

function line(raw: unknown): LngLat[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((p): p is LngLat => Array.isArray(p) && onEarth(p[0], p[1]))
        .map(p => [p[0], p[1]]);
}

/** Only colours a stylesheet can't be escaped from: `#abc`, `#aabbcc`, `#aabbccdd`. */
const colour = (c: unknown) =>
    typeof c === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c) ? c : undefined;

/** The block's places, areas and routes as GeoJSON: what is incomplete is left out. */
export function toGeoJSON(data: MapBlockData | undefined, locale?: string): FeatureCollection {
    const features: MapFeature[] = [];
    for (const f of data?.features ?? []) {
        const label = pick(f?.label, locale).trim();
        const color = colour(f?.color);
        const props = (kind: MapFeature['properties']['kind']) => ({
            kind,
            label,
            ...(color && { color })
        });
        if (f?.kind === 'location') {
            const at = point(f.location);
            if (at)
                features.push({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: at },
                    properties: {
                        ...props('location'),
                        label: label || f.location?.label?.trim() || ''
                    }
                });
        } else if (f?.kind === 'area') {
            const rings = (Array.isArray(f.area?.polygons) ? f.area!.polygons : [])
                .map(line)
                .filter(r => r.length >= 3);
            // A shape closes on its first point.
            const closed = rings.map(r =>
                r[0][0] === r.at(-1)![0] && r[0][1] === r.at(-1)![1] ? r : [...r, r[0]]
            );
            if (closed.length)
                features.push({
                    type: 'Feature',
                    geometry: { type: 'MultiPolygon', coordinates: closed.map(r => [r]) },
                    properties: props('area')
                });
        } else if (f?.kind === 'polyline') {
            const points = line(f.polyline?.points);
            if (points.length >= 2)
                features.push({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: points },
                    properties: props('polyline')
                });
        }
    }
    return { type: 'FeatureCollection', features };
}

function allPoints(g: Geometry): LngLat[] {
    if (g.type === 'Point') return [g.coordinates];
    if (g.type === 'LineString') return g.coordinates;
    return g.coordinates.flat(2);
}

/** Where to look: everything in view unless the editor turned that off and gave a centre. */
export function viewOf(data: MapBlockData | undefined, collection = toGeoJSON(data)): MapView {
    const center = point(data?.center);
    const zoom = finite(data?.zoom) ? Math.max(0, Math.min(22, data!.zoom!)) : undefined;
    const points = collection.features.flatMap(f => allPoints(f.geometry));
    const fit = data?.fitToFeatures !== false || !center;
    if (fit && points.length) {
        const lngs = points.map(p => p[0]);
        const lats = points.map(p => p[1]);
        return {
            bounds: [
                [Math.min(...lngs), Math.min(...lats)],
                [Math.max(...lngs), Math.max(...lats)]
            ]
        };
    }
    return { center: center ?? [0, 0], zoom: zoom ?? (center ? 12 : 1) };
}

const osm = ([lng, lat]: LngLat) =>
    `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;

/** The map without a library: a list of what it shows, each place a link to a map. */
export function renderMap(data: MapBlockData | undefined, locale?: string): string {
    const collection = toGeoJSON(data, locale);
    if (!collection.features.length) return '';
    const what = { location: 'Place', area: 'Area', polyline: 'Route' } as const;
    const items = collection.features
        .map(f => {
            const name = escapeHtml(f.properties.label || what[f.properties.kind]);
            return f.geometry.type === 'Point'
                ? `<li><a href="${osm(f.geometry.coordinates)}" rel="noopener">${name}</a></li>`
                : `<li>${name}</li>`;
        })
        .join('');
    return `<figure class="moteur-geo-map"><ul class="moteur-geo-map__list">${items}</ul></figure>`;
}

export function render(block: MapBlock, locale: string): string {
    return renderMap(block?.data, locale);
}

/** Draws a map in `container`; returns what to call to take it down, if anything. */
export type DrawMap = (
    container: HTMLElement,
    features: FeatureCollection,
    view: MapView
) => void | (() => void);

let drawWith: DrawMap | undefined;

/** The library every `<moteur-geo-map>` draws with: maps already on the page draw now. */
export function useMapLibrary(draw: DrawMap): void {
    drawWith = draw;
    if (typeof document !== 'undefined')
        for (const el of document.querySelectorAll('moteur-geo-map'))
            (el as HTMLElement & { draw?: () => void }).draw?.();
}

/**
 * `<moteur-geo-map>`: set `el.data = block.data` (or a `data` attribute holding it as JSON) and
 * `locale`. Its height is yours to give (`moteur-geo-map .moteur-geo-map__canvas { height: 24rem }`).
 */
export function registerMoteurGeoMapElement(): void {
    if (typeof customElements === 'undefined' || customElements.get('moteur-geo-map')) return;

    class MoteurGeoMap extends HTMLElement {
        #data: MapBlockData | undefined;
        #takeDown: (() => void) | undefined;

        static get observedAttributes() {
            return ['data', 'locale'];
        }

        get data() {
            return this.#data;
        }

        set data(value: MapBlockData | undefined) {
            this.#data = value;
            if (this.isConnected) this.draw();
        }

        connectedCallback() {
            this.draw();
        }

        disconnectedCallback() {
            this.#takeDown?.();
            this.#takeDown = undefined;
        }

        attributeChangedCallback(name: string) {
            if (name === 'data') {
                try {
                    this.#data = JSON.parse(this.getAttribute('data') ?? 'null') ?? undefined;
                } catch {
                    this.#data = undefined;
                }
            }
            if (this.isConnected) this.draw();
        }

        draw() {
            this.#takeDown?.();
            this.#takeDown = undefined;
            const locale = this.getAttribute('locale') ?? undefined;
            const collection = toGeoJSON(this.#data, locale);
            this.innerHTML = renderMap(this.#data, locale);
            if (!drawWith || !collection.features.length) return;
            const canvas = document.createElement('div');
            canvas.className = 'moteur-geo-map__canvas';
            // Map libraries make their own controls reachable; the list under it says what it shows.
            this.querySelector('figure')?.prepend(canvas);
            const done = drawWith(canvas, collection, viewOf(this.#data, collection));
            if (typeof done === 'function') this.#takeDown = done;
        }
    }

    customElements.define('moteur-geo-map', MoteurGeoMap);
}
