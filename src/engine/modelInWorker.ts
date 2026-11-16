import type { FromWorker, Model, ModelInputs, ToWorker } from "./model.js";

/**
 * Starts the model in tinyfix's own worker. Bundlers that understand `new Worker(new URL(…, import.meta.url))`, such
 * as Vite and webpack, give the worker a file of its own. If the worker can't start, this rejects, and tinyfix runs
 * the model on the page instead.
 */
export function loadModelInWorker(bytes: ArrayBuffer, wasmPaths: string | undefined): Promise<Model> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./modelWorker.js", import.meta.url), { type: "module", name: "tinyfix" });
    const send = (message: ToWorker, transfer: Transferable[] = []) => worker.postMessage(message, transfer);
    const pending = new Map<number, { resolve: (scores: Float32Array) => void; reject: (error: Error) => void }>();
    let nextId = 0;

    const fail = (error: Error) => {
      reject(error);
      for (const run of pending.values()) run.reject(error);
      pending.clear();
      worker.terminate();
    };

    const model: Model = {
      run: (inputs: ModelInputs) =>
        new Promise((resolveRun, rejectRun) => {
          const id = nextId++;
          pending.set(id, { resolve: resolveRun, reject: rejectRun });
          const buffers = [inputs.left.data.buffer, inputs.right.data.buffer, inputs.candidates.data.buffer];
          send({ type: "run", id, inputs }, buffers as ArrayBuffer[]);
        }),
      release: async () => worker.terminate(),
    };

    worker.onerror = (event) => {
      event.preventDefault();
      fail(new Error(`tinyfix's worker stopped: ${event.message || "it couldn't start"}.`));
    };
    worker.onmessage = ({ data }: MessageEvent<FromWorker>) => {
      switch (data.type) {
        case "loaded":
          resolve(model);
          return;
        case "load-failed":
          fail(new Error(`tinyfix's model couldn't start: ${data.message}`));
          return;
        case "result":
          pending.get(data.id)?.resolve(data.scores);
          pending.delete(data.id);
          return;
        case "run-failed":
          pending.get(data.id)?.reject(new Error(data.message));
          pending.delete(data.id);
          return;
        default:
          data satisfies never;
      }
    };

    send({ type: "load", model: bytes, wasmPaths }, [bytes]);
  });
}
