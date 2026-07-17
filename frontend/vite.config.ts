import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = env.VITE_DEV_API_PROXY ?? "http://127.0.0.1:8000";

  return {
    plugins: [react()],
    build: {
      outDir: "dist",
      sourcemap: false,
      chunkSizeWarningLimit: 600,
    },
    server: {
      port: 5173,
      proxy: {
        "/api": apiProxyTarget,
        "/ws": { target: apiProxyTarget.replace(/^http/, "ws"), ws: true },
      },
    },
    preview: {
      port: 4173,
    },
  };
});
