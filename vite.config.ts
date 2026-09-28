import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

const API_TARGET = `http://localhost:${process.env.PORT || 3000}`;

export default defineConfig({
  root: "src/web",
  plugins: [
    tanstackRouter({
      target: "react",
      routesDirectory: "routes",
      generatedRouteTree: "routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@shared": new URL("./src/shared", import.meta.url).pathname,
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
      "/a": { target: API_TARGET, changeOrigin: true },
      "/embed": { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
});
