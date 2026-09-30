# Public release notes

Reviewed on 30 September 2026.

## Credentials

The owner reports that the exposed PID/Golemio credentials have been rotated. Old `.env` versions remain in Git history; once every exposed key is revoked, removing those versions is optional cleanup rather than a requirement for invalidating the credentials.

The current staged source contains no matches for the local API keys. This targeted check is not a guarantee that every possible secret or remote artifact has been reviewed.

Before running the app, replace `PID_API_KEY` in the ignored root `.env` and, if used, `server/.env`, plus any deployment configuration. Both local files still contained the historical values when last checked. Provider-side revocation was reported by the owner, not independently verified.

## Map configuration

Set `VITE_CARTO_API_KEY` in the ignored root `.env`; the slot is currently blank. Restrict the key's allowed domains in CARTO. Browser map keys remain visible to visitors even when excluded from Git.

Docker frontend builds accept the same variable as a build argument. The private `PID_API_KEY` remains backend-only. Run `npm run check:public-config` to verify this separation using fake credentials.

## Publication

The repository is private. Publishing source does not require deploying a live app. Review repository visibility separately, and select a license only after confirming rights to the code and included assets.

Keep `.env`, runtime caches, debug output, and editor state out of commits. The tracked `.env.example` files contain placeholders only. If retaining the old history, secret-scanning tools may still flag the revoked values.
