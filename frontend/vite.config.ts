import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Lets a `cloudflared`/ngrok tunnel reach the dev server for testing LIFF/webhooks
    // against a real HTTPS URL. Safe for local dev only — never deploy with this on.
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/api": {
        target: "http://localhost:8789",
        changeOrigin: false,
      },
    },
  },
});
