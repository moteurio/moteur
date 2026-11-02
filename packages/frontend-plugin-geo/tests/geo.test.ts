// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
    registerMoteurGeoMapElement,
    renderMap,
    toGeoJSON,
    useMapLibrary,
    viewOf,
    type MapBlockData
} from '../src/index.js';

const walk: MapBlockData = {
    center: { lat: 45.5, lng: -73.57 },
    zoom: 13,
    features: [
        {
            kind: 'location',
            location: { lat: 45.508, lng: -73.587 },
            label: { en: 'The mountain', fr: 'La montagne' },
            color: '#c00'
        },
        {
            kind: 'area',
            area: {
                polygons: [
                    [
                        [-73.6, 45.5],
                        [-73.59, 45.5],
                        [-73.59, 45.51]
                    ]
                ]
            },
            label: 'The park'
        },
        {
            kind: 'polyline',
            polyline: {
                points: [
                    [-73.58, 45.49],
                    [-73.57, 45.5]
                ]
            },
            color: 'red;background:url(x)'
        },
        { kind: 'location', location: { lat: 200, lng: 0 }, label: 'Off the Earth' },
        { kind: 'polyline', polyline: { points: [[0, 0]] } }
    ]
};

describe('the map block on a site', () => {
    it('turns the block into GeoJSON any map library takes, leaving out what is incomplete', () => {
        const { features } = toGeoJSON(walk, 'fr');
        expect(features.map(f => f.geometry.type)).toEqual(['Point', 'MultiPolygon', 'LineString']);
        expect(features[0]).toEqual({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [-73.587, 45.508] },
            properties: { kind: 'location', label: 'La montagne', color: '#c00' }
        });
        // A shape closes on its first point.
        const ring = (features[1].geometry.coordinates as number[][][][])[0][0];
        expect(ring.at(-1)).toEqual(ring[0]);
        // Only plain colours.
        expect(features[2].properties.color).toBeUndefined();
    });

    it('looks at everything, unless the editor gave a centre and turned that off', () => {
        expect(viewOf(walk)).toEqual({
            bounds: [
                [-73.6, 45.49],
                [-73.57, 45.51]
            ]
        });
        expect(viewOf({ ...walk, fitToFeatures: false })).toEqual({
            center: [-73.57, 45.5],
            zoom: 13
        });
        expect(viewOf({ fitToFeatures: false })).toEqual({ center: [0, 0], zoom: 1 });
    });

    it('without a library: a list of what the map shows, each place a link to a map', () => {
        const html = renderMap(walk, 'en');
        expect(html).toContain(
            '<a href="https://www.openstreetmap.org/?mlat=45.508&mlon=-73.587#map=15/45.508/-73.587" rel="noopener">The mountain</a>'
        );
        expect(html).toContain('<li>The park</li><li>Route</li>');
        expect(
            renderMap({
                features: [
                    {
                        kind: 'location',
                        location: { lat: 1, lng: 1 },
                        label: '<img src=x onerror=alert(1)>'
                    }
                ]
            })
        ).not.toContain('<img');
        expect(renderMap({})).toBe('');
    });

    it('draws with the library the site picks, and takes the map down when removed', () => {
        registerMoteurGeoMapElement();
        const el = document.createElement('moteur-geo-map') as HTMLElement & {
            data?: MapBlockData;
        };
        el.data = walk;
        document.body.append(el);
        expect(el.querySelector('.moteur-geo-map__canvas')).toBeNull();
        const takeDown = vi.fn();
        const draw = vi.fn(() => takeDown);
        useMapLibrary(draw);
        expect(draw).toHaveBeenCalledTimes(1);
        const [canvas, features, view] = draw.mock.calls[0] as unknown as [
            HTMLElement,
            { features: unknown[] },
            unknown
        ];
        expect(canvas.className).toBe('moteur-geo-map__canvas');
        expect(features.features).toHaveLength(3);
        expect(view).toEqual(viewOf(walk));
        expect(el.querySelectorAll('li')).toHaveLength(3);
        el.remove();
        expect(takeDown).toHaveBeenCalled();
    });
});
