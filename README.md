<p align="center">
  <img src="busgo/public/icon-512x512.PNG" alt="BUSGO app icon" width="96" />
</p>

# BUSGO

**Prague public transport, on a live map.**

BUSGO is a personal full-stack project for exploring nearby PID stops, checking upcoming departures, and following a selected journey. It combines a mobile-first React interface with an Express and Socket.IO backend that fetches and caches transit data from Golemio.

## What it does

- **Explore nearby stops** using your location or by moving the map.
- **Check departure boards** with scheduled and predicted times, delays, platforms, and available vehicle information.
- **Follow a journey** with route geometry, upcoming stops, and a vehicle marker. Where live positioning is unavailable, positions may be estimated from the timetable.
- **See multiple transport modes** including buses, trams, metro, trains, ferries, and trolleybuses.
- **Install it as a PWA** with an app icon, service worker, and update flow.

The interface uses a dark map, custom transport icons, animations, and haptic feedback where supported. Live departures and fresh map tiles require an internet connection.

## Built with

| Layer | Technology |
| --- | --- |
| Interface | React 18, Vite, Tailwind CSS, Framer Motion |
| Map | MapLibre GL JS, CARTO Dark Matter, OpenStreetMap |
| Backend | Node.js, Express, Socket.IO, Axios |
| Data | PID stop data and Golemio APIs |
| Deployment | Docker Compose and Nginx |

The backend shares departure polling across clients watching the same stop and caches transit data locally. The frontend renders stop markers, route progress, and vehicle positions as map layers.

## Run locally

Install Node.js 22+ and npm, then run:

```sh
git clone https://github.com/adamvi-VIp/BUSGO.git
cd BUSGO
npm install
```

Copy `.env.example` to `.env` in the repository root. On PowerShell:

```powershell
Copy-Item .env.example .env
```

On macOS or Linux:

```sh
cp .env.example .env
```

Fill in your keys, then start both services **from the repository root**:

```sh
npm run dev
```

Open [localhost:5173](http://localhost:5173). The backend listens on port 3001; Vite proxies Socket.IO and API requests to it. Allow location access to find nearby stops, or explore the map manually.

## Configuration

| Variable | Purpose | Visibility |
| --- | --- | --- |
| `PID_API_KEY` | Golemio transit API access | Private; backend only |
| `VITE_CARTO_API_KEY` | Optional CARTO dark map; blank uses standard OpenStreetMap | Public browser key; embedded at build time |
| `PORT` | Backend port, default `3001` | Server configuration |
| `NODE_ENV` | `development` locally, `production` when deployed | Server configuration |
| `TZ` | `Europe/Prague` | Server configuration |

Get transit credentials from [Golemio](https://api.golemio.cz/) and a map key from [CARTO](https://www.carto.com/basemaps/apikey/). Restrict the CARTO key to the domains you use, including your local development origin when supported. Review usage limits in your provider dashboard.

`.env` and its local variants are ignored by Git and excluded from Docker build contexts. Only placeholder examples belong in Git. **A browser key is still visible in downloaded JavaScript and tile requests**: `.env` keeps it out of source control, not out of the browser. Never prefix a private credential with `VITE_`. See [Vite's environment-variable documentation](https://vite.dev/guide/env-and-mode).

Restart Vite after changing the map key. Production frontend builds must be rebuilt when that key changes. With no key, the app uses the standard OpenStreetMap map and visible attribution. With a key, it uses CARTO's dark map; an invalid key or domain restriction must be corrected in CARTO, or the key cleared before rebuilding. External tiles use the browser's HTTP cache rather than the PWA's permanent asset cache. OpenStreetMap's public tiles are for normal interactive viewing, subject to its [tile usage policy](https://operations.osmfoundation.org/policies/tiles/); do not add bulk downloads or offline tile prefetching.

## Docker Compose

After configuring the root `.env`:

```sh
docker compose up --build -d
```

Open [localhost](http://localhost). Compose supplies the public CARTO key as a frontend build argument and injects the backend configuration at runtime. Never supply `PID_API_KEY` as a frontend build argument.

For builds using `Dockerfile`, `Dockerfile.frontend`, `Dockerfile.standalone`, or `Dockerfile.koyeb`, set the `VITE_CARTO_API_KEY` build argument. Setting it only at container runtime cannot change an already-built frontend. The standalone frontend images still need a separately configured backend proxy for live transit data; Compose includes that wiring.

## Checks

```sh
npm run check:public-config
npm run build --prefix busgo
node busgo/src/utils/routeSegments.selfcheck.js
node busgo/src/utils/stopIdentity.selfcheck.js
```

The public configuration check builds with fake credentials and verifies that the browser bundle contains the map key but excludes the private PID key. Backend regression checks are in `server/*.selfcheck.js` and can be run with Node individually.

## Project layout

```text
busgo/       React interface, map layers, icons, and PWA assets
server/      Transit API integration, polling, caching, and regression checks
scripts/     Development utilities and configuration verification
```

See the [PWA update guide](PWA_UPDATE_GUIDE.md) for app versioning and [Koyeb configuration notes](KOYEB_SECRETS_SETUP.md) for hosting configuration.

## Contributing

Issues and pull requests are welcome. Explain the change and how it was tested; run the checks above before submitting. See [Haptics](HAPTICS.md) for notes on supported device feedback.

## Project status and credits

This is an independent personal project, not an official PID or Golemio application. Data availability, prediction accuracy, and vehicle coverage depend on the upstream services; estimated positions are not GPS observations.

Map data: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Basemap: © [CARTO](https://carto.com/attributions). Transit data comes from [PID](https://pid.cz/) and [Golemio](https://api.golemio.cz/). Their data, tiles, and branding remain subject to their respective terms.

No open-source license has been selected for this repository yet. Public visibility alone does not grant permission to redistribute its code or assets.
