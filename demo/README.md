# tinyfix demo

A page to try tinyfix on: type in the top line, and the bottom line shows what tinyfix makes of it as you go. It's
Svelte, TypeScript and Tailwind, built with Vite into static files.

It runs on this repo's build of tinyfix (`../dist`) rather than the npm release, so it always shows what's in the repo,
and Vite bundles it exactly as it would in an app that installs tinyfix from npm.

```bash
cd demo
npm install
npm run dev      # builds the package, then serves http://localhost:5173
npm run build    # builds the package, type-checks, then builds into dist/
npm run deploy   # builds and publishes dist/ to the Hugging Face Space
```
