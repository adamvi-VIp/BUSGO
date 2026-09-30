# Koyeb configuration

The combined image uses `Dockerfile.koyeb` to build the frontend and run it alongside the backend behind Nginx.

- Set `VITE_CARTO_API_KEY` as a Docker **build argument**. It is a public browser key, embedded in the frontend. Restrict its allowed domains in CARTO.
- Inject `PID_API_KEY` as a backend **runtime secret/environment variable**. Never pass it as a frontend build argument or prefix it with `VITE_`.
- Set runtime `NODE_ENV=production`, `PORT=3001`, and `TZ=Europe/Prague`.
- Expose the combined container's HTTP port `80`.

Local `.env` files are excluded from the Docker build context. In production, the backend reads its credentials from the process environment. Restart the service after changing the PID key; rebuild the frontend after changing the CARTO key.

Use the hosting dashboard to enter private credentials instead of placing them in commands that may be retained in shell history. Refer to [Koyeb's secret documentation](https://www.koyeb.com/docs/reference/secrets) for the current dashboard and service configuration steps.

The backend reports whether a PID key is present, not whether the upstream API accepts it. Verify departures after deployment without copying request headers or credentials into logs or issues.
