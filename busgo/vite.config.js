import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
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
