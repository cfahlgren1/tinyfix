import type * as Ort from "onnxruntime-web/wasm";

/** One input to the wrong-word model: token ids, as many rows as there are words to score. */
export interface ModelInput {
  data: BigInt64Array;
  dims: [rows: number, width: number];
}

export interface ModelInputs {
  left: ModelInput;
  right: ModelInput;
  candidates: ModelInput;
}

/** The wrong-word model, wherever it runs: in this thread, or in tinyfix's own worker. */
export interface Model {
  /** Scores each row's candidate words. */
  run(inputs: ModelInputs): Promise<Float32Array>;
  release(): Promise<void>;
}

/** What the page sends tinyfix's worker. */
export type ToWorker =
  | { type: "load"; model: ArrayBuffer; wasmPaths: string | undefined }
  | { type: "run"; id: number; inputs: ModelInputs };

/** What tinyfix's worker sends back. */
export type FromWorker =
  | { type: "loaded" }
  | { type: "load-failed"; message: string }
  | { type: "result"; id: number; scores: Float32Array }
  | { type: "run-failed"; id: number; message: string };

/** Starts the model in this thread. ONNX Runtime is passed in, so a worker can import it and a page needn't. */
export async function createModel(ort: typeof Ort, bytes: ArrayBuffer, wasmPaths: string | undefined): Promise<Model> {
  // One thread, so a page needs no cross-origin isolation headers.
  ort.env.wasm.numThreads = 1;
  if (wasmPaths) ort.env.wasm.wasmPaths = wasmPaths;
  const session = await ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ["wasm"] });
  const tensor = (input: ModelInput) => new ort.Tensor("int64", input.data, input.dims);
  return {
    async run(inputs) {
      const output = await session.run({
        left: tensor(inputs.left),
        right: tensor(inputs.right),
        candidates: tensor(inputs.candidates),
      });
      return output.scores!.data as Float32Array;
    },
    release: () => session.release(),
  };
}
