# tinyfix demo

A page to try tinyfix on: type in the top line, and the bottom line shows what tinyfix makes of it as you go. It's
Svelte, TypeScript and Tailwind, built with Vite into static files.

It runs on the package's source in `../src` rather than the npm release, so it always shows what's in this repo. An
app that installs tinyfix from npm imports it the same way.

```bash
cd demo
npm install
npm run dev      # http://localhost:5173
npm run build    # type-checks, then builds into dist/
npm run deploy   # builds and publishes dist/ to the Hugging Face Space
```

Two things it does that an app using tinyfix will want too, both in `vite.config.ts` and `src/lib/liveCheck.svelte.ts`:

- **It loads tinyfix with `import()`.** ONNX Runtime starts its worker from the script it's bundled into. If that's the
  page's main script, the worker runs the whole page and fails.
- **It uses ONNX Runtime's WebAssembly-only build** (`onnxruntime-web/wasm`). The default build also carries WebGPU,
  which tinyfix doesn't use, and its `.wasm` is twice the size.
