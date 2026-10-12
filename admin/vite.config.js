import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = (env.VITE_API_URL || "http://localhost:5100").replace(/\/$/, "");
  return {
    plugins: [react(), tailwindcss()],
    // The admin calls the API through Vite in development, like the client.
    server: {
      port: 5175,
      proxy: { "/api": { target, changeOrigin: true }, "/socket.io": { target, changeOrigin: true, ws: true } },
    },
  };
});
