import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The demo runs on the package's own source, so it always shows what's in this repo rather than the last release.
// Apps that install tinyfix from npm import it the same way: `import { loadTinyfix } from "tinyfix"`.
export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  resolve: {
    alias: [
      { find: /^tinyfix$/, replacement: fileURLToPath(new URL("../src/index.ts", import.meta.url)) },
      // tinyfix runs on the CPU, so the plain WebAssembly build of ONNX Runtime is all it needs. The default build also
      // carries WebGPU, which doubles the download.
      { find: /^onnxruntime-web$/, replacement: "onnxruntime-web/wasm" },
    ],
  },
  // ONNX Runtime finds its .wasm files next to its own script, which pre-bundling would move.
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  build: { target: "es2022", chunkSizeWarningLimit: 1200 },
});
