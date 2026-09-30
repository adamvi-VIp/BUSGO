# BUSGO frontend

React, Vite, Tailwind CSS, and MapLibre GL JS power the BUSGO interface.

Use the [repository README](../README.md) for setup, environment variables, Docker deployment, and checks. Run `npm run dev` from the repository root to start both services.

Vite reads the root `.env`. Only the public `VITE_CARTO_API_KEY` belongs in the browser; `PID_API_KEY` must remain server-side.
