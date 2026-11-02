# @moteurio/frontend-plugin-geo

Map blocks from [Moteur](https://moteur.io) on your site, drawn by the map library you pick: Leaflet, MapLibre, OpenLayers. Every one of them takes GeoJSON, and this turns the block into it. Without a library, the block is a list of its places, each a link to a map.

```bash
npm install @moteurio/frontend-plugin-geo
```

## The pieces

- `toGeoJSON(data, locale)`: the block's places, areas and routes, with each one's label and colour in `properties`. What is incomplete (a route with one point, a place off the Earth) is left out.
- `viewOf(data)`: where to look. The box around everything (`bounds`), or the editor's centre and zoom when they turned "Fit to features" off.
- `renderMap(data, locale)` (and `render(block, locale)` for a block registry): HTML that needs no library, a list of what the map shows, each place a link to OpenStreetMap. What a reader without the map, or with a screen reader, gets.

## As a tag, with Leaflet

```ts
import L from 'leaflet';
import { useMapLibrary } from '@moteurio/frontend-plugin-geo';
import '@moteurio/frontend-plugin-geo/element';

useMapLibrary((container, features, view) => {
    const map = L.map(container);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    L.geoJSON(features, {
        style: f => ({ color: f?.properties.color ?? '#3366cc' }),
        onEachFeature: (f, layer) => f.properties.label && layer.bindTooltip(f.properties.label)
    }).addTo(map);
    if (view.bounds)
        map.fitBounds(
            view.bounds.map(([lng, lat]) => [lat, lng]),
            { padding: [24, 24] }
        );
    else map.setView([view.center![1], view.center![0]], view.zoom);
    return () => map.remove();
});

document.querySelector('moteur-geo-map').data = block.data;
```

Give the map its height: `moteur-geo-map .moteur-geo-map__canvas { height: 24rem }`. The list stays under it.

## With MapLibre

```ts
useMapLibrary((container, features, view) => {
    const map = new maplibregl.Map({
        container,
        style: 'https://demotiles.maplibre.org/style.json',
        ...view
    });
    map.on('load', () => {
        map.addSource('block', { type: 'geojson', data: features });
        map.addLayer({
            id: 'areas',
            type: 'fill',
            source: 'block',
            filter: ['==', '$type', 'Polygon'],
            paint: { 'fill-opacity': 0.3 }
        });
        map.addLayer({
            id: 'routes',
            type: 'line',
            source: 'block',
            filter: ['==', '$type', 'LineString']
        });
        map.addLayer({
            id: 'places',
            type: 'circle',
            source: 'block',
            filter: ['==', '$type', 'Point']
        });
    });
    if (view.bounds) map.fitBounds(view.bounds, { padding: 24 });
    return () => map.remove();
});
```

MIT
