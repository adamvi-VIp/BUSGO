import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Only VITE_ variables are exposed to the browser; PID_API_KEY stays server-side.
  envDir: fileURLToPath(new URL('..', import.meta.url)),
  server: {
    host: '0.0.0.0', // Listen on all interfaces for LAN access
    port: 5173,      // Default Vite port, change if needed
    // This will proxy any requests starting with /socket.io
    // from the Vite dev server to your Express server on port 3001.
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true, // Important for enabling WebSocket proxying
      },
      '/api': 'http://localhost:3001',
    },
  },
});
