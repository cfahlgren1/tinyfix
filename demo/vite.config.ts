import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The demo runs on this repo's build of tinyfix (../dist) rather than the npm release, so it always shows what's in
// the repo and is bundled exactly as an app that installs tinyfix is. `npm run build` builds the package first.
export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  resolve: {
    alias: [{ find: /^tinyfix$/, replacement: fileURLToPath(new URL("../dist/index.js", import.meta.url)) }],
  },
  // ONNX Runtime finds its .wasm file next to its own script, which pre-bundling would move.
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  build: { target: "es2022", chunkSizeWarningLimit: 1200 },
});
