// Downloads the model and word lists the tests run against into .models/, once. They come from the same Hugging Face
// revision the package loads by default.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const revision = /MODEL_REVISION = "([0-9a-f]{40})"/.exec(
  readFileSync(new URL("../src/index.ts", import.meta.url), "utf8"),
)?.[1];
if (!revision) throw new Error("Couldn't find MODEL_REVISION in src/index.ts.");
const folder = new URL(`../.models/${revision}/`, import.meta.url);
mkdirSync(folder, { recursive: true });
for (const file of ["words.txt", "wrong-word.onnx", "wrong-word-vocab.txt", "wrong-word-confusions.txt"]) {
  const target = new URL(file, folder);
  if (existsSync(target)) continue;
  const response = await fetch(`https://huggingface.co/paperweight/tinyfix/resolve/${revision}/${file}`);
  if (!response.ok) throw new Error(`Couldn't download ${file} (${response.status}).`);
  writeFileSync(target, new Uint8Array(await response.arrayBuffer()));
  console.log("downloaded", file);
}
