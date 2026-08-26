import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: ".",
  base: "./",
  server: {
    port: 3000,
    proxy: {
      "/api": "http://localhost:5000",
      "/world": {
        target: "ws://localhost:5000",
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        game: resolve(__dirname, "game.html"),
        admin: resolve(__dirname, "admin.html"),
        tuner: resolve(__dirname, "tuner.html"),
      },
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (
              id.includes("pixi.js") ||
              id.includes("pixi-layers") ||
              id.includes("pixi-particles") ||
              id.includes("pixi-tilemap")
            ) {
              return "pixi-vendor";
            }
          }
        },
      },
    },
  },
});
