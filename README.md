# Roamline

Roamline turns a Google Maps Timeline export into a private, visual atlas of your life in motion.

Drop in a Timeline JSON file and explore it on a dark, rotatable 3D globe. See the full shape of your travels, replay movement over time, find dense activity zones, and dig into statistics by year, country, day, and activity mode.

> **Early public build** — Roamline is still evolving and this is not the final version. Expect rough edges while the timeline parser, visual language, and exploration tools continue to develop.

## What it can do

- Load Google Maps Timeline JSON exports with drag-and-drop or a file picker.
- Process timeline data locally in the browser, including large exports through a Web Worker.
- Explore a MapLibre-powered 3D globe with route layers, heatmap activity, and atmospheric styling.
- Switch between All activity, Replay, Heatmap, and Stats views.
- Compare time spent and movement frequency in heatmap mode.
- Filter the visible history by date range and activity type.
- Inspect route segments directly on the map; visits appear in statistics and heatmap data.
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

Then open [http://localhost:7863](http://localhost:7863).

Roamline works with the built-in CARTO fallback. To use a Mapbox dark basemap locally, add a public token to `.env.local`:

```bash
MAPBOX_ACCESS_TOKEN=your_public_mapbox_token
```

The server reads this value at runtime and exposes it to the browser only when the map initializes. Never put private credentials or a personal timeline export in the repository.

## Run with Docker

Build and run the production image:

```bash
docker build -t roamline .
docker run --publish 7863:7863 roamline
```

The image uses the CARTO basemap fallback by default. Mapbox access is optional and uses a public browser token. The token is read from the container environment at request time, so it is not embedded in the image and does not require an image rebuild.

For a local or self-hosted Compose deployment, create an ignored `.env` file beside the Compose file:

```bash
MAPBOX_ACCESS_TOKEN=your_public_mapbox_token
```

Then start the public image with the runtime value:

```bash
docker compose -f docker-compose.example.yml up -d
```

Without the `.env` file, the app uses CARTO. For a direct Docker run, pass the value at startup:

```bash
docker run --env MAPBOX_ACCESS_TOKEN=your_public_mapbox_token --publish 7863:7863 roamline
```

The public image is used by the example Compose configuration:

```bash
docker compose -f docker-compose.example.yml up -d
```

The GitHub Actions workflow publishes `ghcr.io/hibenji/roamline:latest` after successful builds on `main`. The first publication may need to be changed to Public in the repository's GitHub Packages settings before it can be pulled anonymously. Set `MAPBOX_ACCESS_TOKEN` in the environment of the service that deploys the image; no GitHub Actions secret is needed for the image build.

The token is public by design because it is sent to the browser; restrict it to the appropriate Mapbox scopes and allowed URLs.

## Quality checks

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

## Roadmap

The project is being shaped around a few ideas: better handling of new Timeline export formats, more useful personal patterns, richer replay controls, and a calmer map experience that makes years of movement feel readable rather than overwhelming.

Feedback, bug reports, and thoughtful suggestions are welcome while the project is still taking shape.
