# Roamline

Roamline turns a Google Maps Timeline export into a private, visual atlas of your life in motion.

Drop in a Timeline JSON file and explore it on a dark, rotatable 3D globe. See the full shape of your travels, replay movement over time, find dense activity zones, and dig into statistics by year, country, day, and activity mode.

> **Early public build** — Roamline is still evolving and this is not the final version. Expect rough edges while the timeline parser, visual language, and exploration tools continue to develop.

## What it can do

- Load Google Maps Timeline JSON exports with drag-and-drop or a file picker.
- Process timeline data locally in the browser, including large exports through a Web Worker.
- Explore a MapLibre-powered 3D globe with route layers, visit points, and atmospheric styling.
- Switch between All activity, Replay, Heatmap, and Stats views.
- Compare time spent and movement frequency in heatmap mode.
- Filter the visible history by date range and activity type.
- Inspect route segments and visited places directly on the map.
- Replay a timeline with scrubbing and adjustable playback speed.
- View distance, active days, visits, countries, yearly trends, weekly rhythm, and movement modes.
- Optionally connect nearby chronological route segments, including uninterrupted flight legs.

## Privacy first

Your timeline file is parsed in your browser and is not uploaded by Roamline. The app may request basemap tiles from Mapbox or its CARTO fallback, but your Timeline JSON stays on your device.

Personal exports should never be committed to this repository. The included first-load journey is synthetic and anonymized.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

Roamline works with the built-in CARTO fallback. To use a Mapbox dark basemap locally, add a public token to `.env.local`:

```bash
VITE_MAPBOX_ACCESS_TOKEN=your_public_mapbox_token
```

The token is only used by the browser for map tiles. Never put private credentials or a personal timeline export in the repository.

## Quality checks

```bash
npm run lint
npm test
npm run build
```

## Roadmap

The project is being shaped around a few ideas: better handling of new Timeline export formats, more useful personal patterns, richer replay controls, and a calmer map experience that makes years of movement feel readable rather than overwhelming.

Feedback, bug reports, and thoughtful suggestions are welcome while the project is still taking shape.
