import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// ESM dirname pattern
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cartographerPlugin = [];

if (
  process.env.NODE_ENV !== "production" &&
  process.env.REPL_ID !== undefined
) {
  try {
    const { cartographer } = await import("@replit/vite-plugin-cartographer");
    cartographerPlugin = [cartographer()];
  } catch (e) {
    console.warn("Cartographer plugin failed to load", e);
  }
}

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...cartographerPlugin,
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});

