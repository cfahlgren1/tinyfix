import { Fixer, WITH_MODEL_WEIGHTS, parseWordList } from "./engine/fixer.js";
import { createModel, type Model } from "./engine/model.js";
import { loadModelInWorker } from "./engine/modelInWorker.js";
import { WordTrie } from "./engine/trie.js";
import { CAREFUL_WRONG_WORD, EAGER_WRONG_WORD, WrongWordChecker } from "./engine/wrongWord.js";

/** One change tinyfix would make to a text. */
export interface Fix {
  /** Where the word starts in the text, as a string index. */
  from: number;
  /** Where the word ends. */
  to: number;
  /** What was typed. */
  original: string;
  /** What it should be. */
  replacement: string;
  /** A misspelling, or a correctly spelled word that doesn't fit the words around it. */
  kind: "spelling" | "context";
  /** How sure tinyfix is, from 0 to 1. */
  confidence: number;
}

export interface LoadOptions {
  /** Where the model and word lists are. Defaults to the tinyfix repo on Hugging Face, at a fixed revision. */
  baseUrl?: string | URL;
  /** Pass false to skip the model: nothing but the word list is downloaded, and only misspellings are fixed. */
  model?: boolean;
  /**
   * How sure tinyfix must be before it changes a correctly spelled word. "balanced" is what offlinepage.app uses and
   * what the published numbers describe. "careful" makes fewer wrong changes and fixes fewer wrong words.
   */
  mode?: "balanced" | "careful";
  /** Where ONNX Runtime's .wasm files are, for apps that host them. Most bundlers find them without this. */
  wasmPaths?: string;
}

export interface CheckOptions {
  /** Only words inside this range of the text are checked. The rest of the text is still read as context. */
  range?: readonly [from: number, to: number];
  /** Only these kinds of fix are looked for. Both, by default. */
  kinds?: ReadonlyArray<Fix["kind"]>;
}

export interface Tinyfix {
  /** Finds the fixes for a text. They come back in order and never overlap. */
  check(text: string, options?: CheckOptions): Promise<Fix[]>;
  /** Returns the text with the fixes made. Throws if a fix doesn't match the text it's applied to. */
  apply(text: string, fixes: readonly Fix[]): string;
  /** Checks a text and makes every fix. */
  fix(text: string, options?: CheckOptions): Promise<string>;
  /** Never change this word again. Use it when someone undoes a fix, or for words of their own. */
  ignore(word: string): void;
  /** Frees the model. The checker can't be used afterwards. */
  dispose(): Promise<void>;
}

/** The revision of huggingface.co/paperweight/tinyfix this version of the package was tested with. */
const MODEL_REVISION = "8efdf5cd91b32584f4077aa0e8ecaf48f7651bef";
const DEFAULT_BASE_URL = `https://huggingface.co/paperweight/tinyfix/resolve/${MODEL_REVISION}/`;

/**
 * Sure enough to change a misspelled word, with the model helping to choose. offlinepage.app uses the same bar: it
 * fixes more misspellings than the stricter default, and is what lets a doubled-key slip like "sporrt" become "sport".
 */
const SPELLING_MIN_CONFIDENCE = 0.55;
/** How much text before a word the engine is given. It reads 16 words back, so this is plenty. */
const CONTEXT_BEFORE = 600;
const CONTEXT_AFTER = 200;

const WORD = /[A-Za-z']+/g;
/** A fenced code block. An unclosed one runs to the end of the text. */
const FENCED_CODE = /```[\s\S]*?(?:```|$)/g;
/** Inline code. An unclosed one runs to the end of its line. */
const INLINE_CODE = /`[^`\n]*(?:`|$)/gm;
/** Parts of a web address, an email, a path, a tag or an identifier: not prose. */
const NOT_PROSE = /[@/\\_#\d]|\.\w/;

const lines = (text: string): string[] => text.split("\n").filter(Boolean);
/** Lets a page draw and handle input between pieces of setup, so loading never freezes it. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve));

async function download(base: string, file: string): Promise<Response> {
  const response = await fetch(new URL(file, base));
  if (!response.ok) throw new Error(`tinyfix couldn't load ${file} from ${base} (${response.status}).`);
  return response;
}

const downloadText = (base: string, file: string) => download(base, file).then((response) => response.text());

/** The start and end of each stretch of code in a text. */
function codeRanges(text: string): Array<[number, number]> {
  return [FENCED_CODE, INLINE_CODE].flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match): [number, number] => [match.index, match.index + match[0].length]),
  );
}

/** The run of non-space characters around a word: "john@form.com" for the "form" inside it. */
function tokenAround(text: string, from: number, to: number): string {
  let start = from;
  while (start > 0 && !/\s/.test(text[start - 1]!)) start--;
  let end = to;
  while (end < text.length && !/\s/.test(text[end]!)) end++;
  return text.slice(start, end);
}

function apply(text: string, fixes: readonly Fix[]): string {
  let result = text;
  // Last fix first, so earlier positions stay valid as the text changes length.
  for (const fix of [...fixes].sort((first, second) => second.from - first.from)) {
    if (text.slice(fix.from, fix.to) !== fix.original) {
      throw new Error(
        `This fix expects “${fix.original}” at ${fix.from}, but the text has “${text.slice(fix.from, fix.to)}”.`,
      );
    }
    result = result.slice(0, fix.from) + fix.replacement + result.slice(fix.to);
  }
  return result;
}

/**
 * On a page, the model runs in tinyfix's own worker, so starting it and checking words never block typing. Elsewhere,
 * or if the worker can't start, it runs right here.
 */
async function startModel(bytes: ArrayBuffer, wasmPaths: string | undefined): Promise<Model> {
  const runHere = async (modelBytes: ArrayBuffer) => {
    // The WebAssembly-only build of ONNX Runtime. The default build also carries WebGPU, which tinyfix doesn't use.
    const ort = await import("onnxruntime-web/wasm");
    return createModel(ort, modelBytes, wasmPaths);
  };
  if (typeof document === "undefined" || typeof Worker === "undefined") return runHere(bytes);
  // The worker is handed a copy, so the bytes are still here if it can't start.
  return loadModelInWorker(bytes.slice(0), wasmPaths).catch(() => runHere(bytes));
}

/**
 * Loads tinyfix: about 3.5 MB of model and word lists, from Hugging Face unless `baseUrl` says otherwise. Call it
 * once and keep the result.
 */
export async function loadTinyfix(options: LoadOptions = {}): Promise<Tinyfix> {
  const base = String(options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/?$/, "/");
  const absoluteBase = typeof location === "undefined" ? base : new URL(base, location.href).href;
  const useModel = options.model !== false;

  const [words, modelFiles] = await Promise.all([
    downloadText(absoluteBase, "words.txt"),
    useModel
      ? Promise.all([
          download(absoluteBase, "wrong-word.onnx").then((response) => response.arrayBuffer()),
          downloadText(absoluteBase, "wrong-word-vocab.txt"),
          downloadText(absoluteBase, "wrong-word-confusions.txt"),
        ])
      : null,
  ]);

  let model: Model | null = null;
  let wrongWord: WrongWordChecker | null = null;
  if (modelFiles) {
    const [bytes, vocabulary, confusions] = modelFiles;
    model = await startModel(bytes, options.wasmPaths);
    await nextTask();
    wrongWord = new WrongWordChecker({
      model,
      vocabulary: lines(vocabulary),
      confusions: lines(confusions),
      settings: options.mode === "careful" ? CAREFUL_WRONG_WORD : EAGER_WRONG_WORD,
    });
  }

  await nextTask();
  const wordList = parseWordList(words);
  await nextTask();
  const trie = await WordTrie.inSteps(
    wordList.map((entry) => entry.word),
    nextTask,
  );
  const fixer = wrongWord
    ? new Fixer({
        words: wordList,
        trie,
        scorer: wrongWord,
        weights: { ...WITH_MODEL_WEIGHTS, minConfidence: SPELLING_MIN_CONFIDENCE },
      })
    : new Fixer({ words: wordList, trie });

  async function check(text: string, checkOptions: CheckOptions = {}): Promise<Fix[]> {
    const [rangeFrom, rangeTo] = checkOptions.range ?? [0, text.length];
    const kinds = checkOptions.kinds ?? ["spelling", "context"];
    const wantsSpelling = kinds.includes("spelling");
    const wantsContext = kinds.includes("context") && wrongWord !== null;
    const code = codeRanges(text);
    const fixes: Fix[] = [];
    // The text up to the word being checked, with the fixes found so far already made. A later word is judged
    // against corrected text, as it would be while typing.
    let fixedSoFar = "";
    let consumed = 0;

    for (const match of text.matchAll(WORD)) {
      const original = match[0];
      const from = match.index;
      const to = from + original.length;
      if (to <= rangeFrom) continue;
      if (from >= rangeTo) break;
      if (code.some(([start, end]) => from < end && to > start)) continue;
      if (fixer.wasUndone(original) || NOT_PROSE.test(tokenAround(text, from, to))) continue;

      const before = (fixedSoFar + text.slice(consumed, from)).slice(-CONTEXT_BEFORE);
      let correction = wantsSpelling ? await fixer.correct(before, original) : null;
      if (!correction && wantsContext && wrongWord) {
        const lineEnd = text.indexOf("\n", to);
        const after = text.slice(to, Math.min(lineEnd === -1 ? text.length : lineEnd, to + CONTEXT_AFTER));
        correction = await wrongWord.check(before, original, after);
      }
      if (!correction || correction.replacement === original) continue;

      fixes.push({
        from,
        to,
        original,
        replacement: correction.replacement,
        kind: correction.usedContext ? "context" : "spelling",
        confidence: Math.max(0, Math.min(1, correction.confidence)),
      });
      fixedSoFar = (fixedSoFar + text.slice(consumed, from)).slice(-CONTEXT_BEFORE) + correction.replacement;
      consumed = to;
    }
    return fixes;
  }

  return {
    check,
    apply,
    fix: async (text, checkOptions) => apply(text, await check(text, checkOptions)),
    ignore: (word) => fixer.rememberUndo(word),
    dispose: async () => {
      await model?.release();
    },
  };
}
