// vite.config.js
import { defineConfig } from "file:///C:/Users/abern/Documents/GitHub/BUSGO/busgo/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/abern/Documents/GitHub/BUSGO/busgo/node_modules/@vitejs/plugin-react/dist/index.mjs";
var vite_config_default = defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    // Listen on all interfaces for LAN access
    port: 5173,
    // Default Vite port, change if needed
    // This will proxy any requests starting with /socket.io
    // from the Vite dev server to your Express server on port 3001.
    proxy: {
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true
        // Important for enabling WebSocket proxying
      },
      "/api": "http://localhost:3001"
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxhYmVyblxcXFxEb2N1bWVudHNcXFxcR2l0SHViXFxcXEJVU0dPXFxcXGJ1c2dvXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxhYmVyblxcXFxEb2N1bWVudHNcXFxcR2l0SHViXFxcXEJVU0dPXFxcXGJ1c2dvXFxcXHZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9hYmVybi9Eb2N1bWVudHMvR2l0SHViL0JVU0dPL2J1c2dvL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xuXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW3JlYWN0KCldLFxuICBzZXJ2ZXI6IHtcbiAgICBob3N0OiAnMC4wLjAuMCcsIC8vIExpc3RlbiBvbiBhbGwgaW50ZXJmYWNlcyBmb3IgTEFOIGFjY2Vzc1xuICAgIHBvcnQ6IDUxNzMsICAgICAgLy8gRGVmYXVsdCBWaXRlIHBvcnQsIGNoYW5nZSBpZiBuZWVkZWRcbiAgICAvLyBUaGlzIHdpbGwgcHJveHkgYW55IHJlcXVlc3RzIHN0YXJ0aW5nIHdpdGggL3NvY2tldC5pb1xuICAgIC8vIGZyb20gdGhlIFZpdGUgZGV2IHNlcnZlciB0byB5b3VyIEV4cHJlc3Mgc2VydmVyIG9uIHBvcnQgMzAwMS5cbiAgICBwcm94eToge1xuICAgICAgJy9zb2NrZXQuaW8nOiB7XG4gICAgICAgIHRhcmdldDogJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMScsXG4gICAgICAgIHdzOiB0cnVlLCAvLyBJbXBvcnRhbnQgZm9yIGVuYWJsaW5nIFdlYlNvY2tldCBwcm94eWluZ1xuICAgICAgfSxcbiAgICAgICcvYXBpJzogJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMScsXG4gICAgfSxcbiAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFpVSxTQUFTLG9CQUFvQjtBQUM5VixPQUFPLFdBQVc7QUFHbEIsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sQ0FBQztBQUFBLEVBQ2pCLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQTtBQUFBLElBQ04sTUFBTTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBR04sT0FBTztBQUFBLE1BQ0wsY0FBYztBQUFBLFFBQ1osUUFBUTtBQUFBLFFBQ1IsSUFBSTtBQUFBO0FBQUEsTUFDTjtBQUFBLE1BQ0EsUUFBUTtBQUFBLElBQ1Y7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
