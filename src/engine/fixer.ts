import { applyFixedRule, isBritishSpelling, isCheckable, isNewerWord, matchCase } from "./rules.js";
import { WordTrie } from "./trie.js";
import { typoCost } from "./typoCost.js";

export interface ContextScorer {
  /** Returns the log probability of each word appearing right after `textBefore`. */
  score(textBefore: string, words: readonly string[]): Promise<number[]>;
}

export interface FixerWeights {
  frequency: number;
  context: number;
  keepCost: number;
  minConfidence: number;
}

export const DEFAULT_WEIGHTS: FixerWeights = { frequency: 0.5, context: 0, keepCost: 10, minConfidence: 0.7 };

/** Use with a context scorer, so the model helps choose between spelling candidates. */
export const WITH_MODEL_WEIGHTS: FixerWeights = { ...DEFAULT_WEIGHTS, context: 0.25 };

export interface WordEntry {
  word: string;
  count: number;
}

export interface Candidate {
  word: string;
  cost: number;
  logFrequency: number;
  contextGain: number;
}

export interface Correction {
  original: string;
  replacement: string;
  confidence: number;
  /** True when the word was spelled correctly but didn't fit the sentence. */
  usedContext?: boolean;
}

export interface FixerOptions {
  words: readonly WordEntry[];
  /** A trie already built from `words`, in the same order. Built here when missing. */
  trie?: WordTrie;
  scorer?: ContextScorer;
  weights?: Partial<FixerWeights>;
  maxCandidates?: number;
}

export function parseWordList(text: string): WordEntry[] {
  return text.split("\n").flatMap((line) => {
    const [word, count] = line.trim().split(/\s+/);
    return word && count ? [{ word, count: Number(count) }] : [];
  });
}

export function pickCandidate(
  candidates: readonly Candidate[],
  weights: FixerWeights,
): { word: string; confidence: number } | null {
  if (candidates.length === 0) return null;
  const scored = candidates.map((candidate) => ({
    word: candidate.word,
    score: -candidate.cost + weights.frequency * candidate.logFrequency + weights.context * candidate.contextGain,
  }));
  const best = scored.reduce((top, entry) => (entry.score > top.score ? entry : top));
  const total = scored.reduce(
    (sum, entry) => sum + Math.exp(entry.score - best.score),
    Math.exp(-weights.keepCost - best.score),
  );
  const confidence = 1 / total;
  return confidence >= weights.minConfidence ? { word: best.word, confidence } : null;
}

export class Fixer {
  private readonly words: readonly WordEntry[];
  private readonly known = new Set<string>();
  private readonly trie: WordTrie;
  private readonly scorer: ContextScorer | undefined;
  private readonly weights: FixerWeights;
  private readonly maxCandidates: number;
  private readonly totalCount: number;

  constructor(options: FixerOptions) {
    this.words = options.words;
    this.words.forEach((entry) => this.known.add(entry.word));
    this.trie = options.trie ?? new WordTrie(this.words.map((entry) => entry.word));
    this.scorer = options.scorer;
    this.weights = { ...DEFAULT_WEIGHTS, ...options.weights };
    this.maxCandidates = options.maxCandidates ?? 12;
    this.totalCount = this.words.reduce((sum, entry) => sum + entry.count, 0);
  }

  /** Treats a word as correct from now on, for example after the user undoes a fix. */
  learn(word: string): void {
    this.known.add(word.toLowerCase());
  }

  isKnown(word: string): boolean {
    const lower = word.toLowerCase();
    const isListed = (candidate: string) => this.known.has(candidate);
    return isListed(lower) || isNewerWord(lower) || isBritishSpelling(lower, isListed);
  }

  /** Ranks spelling candidates for an unknown word, or returns null when the word should be left alone. */
  async analyze(textBefore: string, word: string): Promise<Candidate[] | null> {
    if (!isCheckable(word, textBefore) || this.isKnown(word)) return null;
    const lower = word.toLowerCase();
    const maxEdits = lower.length <= 4 ? 1 : 2;
    const ranked = this.trie
      .search(lower, maxEdits)
      .map(({ index }) => {
        const entry = this.words[index]!;
        return {
          word: entry.word,
          cost: typoCost(lower, entry.word),
          logFrequency: Math.log(entry.count / this.totalCount),
          contextGain: 0,
        };
      })
      .sort((first, second) => second.logFrequency - second.cost - (first.logFrequency - first.cost))
      .slice(0, this.maxCandidates);
    if (!this.scorer || ranked.length === 0) return ranked;

    const scores = await this.scorer.score(textBefore, [
      word,
      ...ranked.map((candidate) => matchCase(word, candidate.word)),
    ]);
    const typedScore = scores[0]!;
    return ranked.map((candidate, index) => ({ ...candidate, contextGain: scores[index + 1]! - typedScore }));
  }

  /** Returns a correction for the word just finished after `textBefore`, or null to keep it. */
  async correct(textBefore: string, word: string): Promise<Correction | null> {
    const ruled = applyFixedRule(word);
    if (ruled && ruled !== word && !this.wasUndone(word)) return { original: word, replacement: ruled, confidence: 1 };
    const candidates = await this.analyze(textBefore, word);
    if (!candidates) return null;
    const pick = pickCandidate(candidates, this.weights);
    return pick ? { original: word, replacement: matchCase(word, pick.word), confidence: pick.confidence } : null;
  }

  private readonly undone = new Set<string>();

  /** Stops a fixed rule from firing again for a word the user restored. */
  rememberUndo(word: string): void {
    this.undone.add(word.toLowerCase());
    this.learn(word);
  }

  wasUndone(word: string): boolean {
    return this.undone.has(word.toLowerCase());
  }
}
