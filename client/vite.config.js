import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = (env.VITE_API_URL || "http://localhost:5100").replace(/\/$/, "");

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      // In dev the browser only talks to Vite (see src/api/axios.js).
      proxy: {
        "/api": { target, changeOrigin: true },
        "/socket.io": { target, changeOrigin: true, ws: true },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router"],
            hls: ["hls.js"],
          },
        },
      },
    },
  };
});
