# PWA Update & Versioning Guide

This guide explains how to ensure all users (including those using the app in Standalone/PWA mode) receive the latest updates.

## How it works

1.  **Version Comparison**: The application has a `VersionManager` component that runs in the background. It compares the `CURRENT_VERSION` hardcoded in the app with a `version.json` file hosted on the server.
- **Detection**: Every 60 seconds (and whenever the app is brought to the foreground), the app fetches `/version.json`.
- **Force Update**: If the server version is different from the client version:
    - Service Workers are unregistered (this forces a clean slate).
    - Browser caches are cleared.
    - The page is forcefully reloaded (`window.location.reload(true)`).
- **Service Worker Sync**: The `bump-version` script also updates the `CACHE_NAME` inside `service-worker.js`. When the browser detects even a 1-byte change in the service worker file, it installs the new one immediately.

## How to trigger an update

Whenever you make significant changes (like adding haptic feedback), you should "bump" the version:

1.  Open a terminal in the `busgo` directory.
2.  Run the following command:
    ```bash
    npm run bump-version
    ```
3.  This script will:
    - Generate a new unique version ID based on the current timestamp.
    - Update `src/currentVersion.js` (used by the client).
    - Update `public/version.json` (deployed to the server).
    - **New**: Update `public/service-worker.js` to change the `CACHE_NAME`, ensuring the browser detects a service worker update.
4.  **Deploy**: Once you deploy the new build, users' devices will detect the change within a minute and refresh automatically.

## Files involved

- `scripts/bump_version.js`: The automation script.
- `busgo/src/currentVersion.js`: Stores the local version ID.
- `busgo/public/version.json`: The "source of truth" on the server.
- `busgo/src/components/VersionManager.jsx`: The background logic that monitors for updates.
