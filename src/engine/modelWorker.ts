// tinyfix's worker: it holds the model, so starting it and running it never block the page. It only imports ONNX
// Runtime and the code below, never the page's own scripts.
import * as ort from "onnxruntime-web/wasm";
import { createModel, type FromWorker, type Model, type ToWorker } from "./model.js";

const reply = globalThis.postMessage as (message: FromWorker, transfer?: Transferable[]) => void;
let model: Model | null = null;

globalThis.onmessage = async ({ data }: MessageEvent<ToWorker>) => {
  switch (data.type) {
    case "load":
      try {
        model = await createModel(ort, data.model, data.wasmPaths);
        reply({ type: "loaded" });
      } catch (error) {
        reply({ type: "load-failed", message: String(error) });
      }
      return;
    case "run":
      try {
        if (!model) throw new Error("The model isn't loaded yet.");
        const scores = await model.run(data.inputs);
        reply({ type: "result", id: data.id, scores }, [scores.buffer]);
      } catch (error) {
        reply({ type: "run-failed", id: data.id, message: String(error) });
      }
      return;
    default:
      data satisfies never;
  }
};
