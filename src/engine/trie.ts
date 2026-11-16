export interface TrieMatch {
  index: number;
  distance: number;
}

/** Compact trie that finds dictionary words within a small edit distance of a query. */
export class WordTrie {
  private readonly character: number[] = [0];
  private readonly firstChild: number[] = [-1];
  private readonly nextSibling: number[] = [-1];
  private readonly wordIndex: number[] = [-1];

  constructor(words: readonly string[]) {
    words.forEach((word, index) => this.insert(word, index));
  }

  /** Builds the same trie a few thousand words at a time, calling `pause` in between so a page stays responsive. */
  static async inSteps(words: readonly string[], pause: () => Promise<void>, step = 8000): Promise<WordTrie> {
    const trie = new WordTrie([]);
    for (let start = 0; start < words.length; start += step) {
      const end = Math.min(words.length, start + step);
      for (let index = start; index < end; index++) trie.insert(words[index]!, index);
      await pause();
    }
    return trie;
  }

  private insert(word: string, index: number): void {
    let node = 0;
    for (let position = 0; position < word.length; position++) {
      node = this.findOrCreateChild(node, word.charCodeAt(position));
    }
    this.wordIndex[node] = index;
  }

  private findOrCreateChild(parent: number, code: number): number {
    let child = this.firstChild[parent]!;
    while (child !== -1) {
      if (this.character[child] === code) return child;
      child = this.nextSibling[child]!;
    }
    const created = this.character.length;
    this.character.push(code);
    this.firstChild.push(-1);
    this.nextSibling.push(this.firstChild[parent]!);
    this.wordIndex.push(-1);
    this.firstChild[parent] = created;
    return created;
  }

  /** Returns every word within `maxEdits` insertions, deletions, substitutions or adjacent swaps. */
  search(query: string, maxEdits: number): TrieMatch[] {
    const width = query.length + 1;
    const matches: TrieMatch[] = [];
    const typed = Array.from({ length: query.length }, (_, position) => query.charCodeAt(position));

    const walk = (node: number, previousCode: number, row: Uint8Array, rowBefore: Uint8Array | null): void => {
      for (let child = this.firstChild[node]!; child !== -1; child = this.nextSibling[child]!) {
        const code = this.character[child]!;
        const next = new Uint8Array(width);
        next[0] = row[0]! + 1;
        let smallest = next[0]!;
        for (let column = 1; column < width; column++) {
          const substitution = row[column - 1]! + (typed[column - 1] === code ? 0 : 1);
          let value = Math.min(row[column]! + 1, next[column - 1]! + 1, substitution);
          const isSwap = rowBefore && column > 1 && typed[column - 1] === previousCode && typed[column - 2] === code;
          if (isSwap) value = Math.min(value, rowBefore[column - 2]! + 1);
          next[column] = value;
          smallest = Math.min(smallest, value);
        }
        const distance = next[width - 1]!;
        if (this.wordIndex[child] !== -1 && distance <= maxEdits) {
          matches.push({ index: this.wordIndex[child]!, distance });
        }
        if (smallest <= maxEdits) walk(child, code, next, row);
      }
    };

    walk(
      0,
      -1,
      Uint8Array.from({ length: width }, (_, column) => column),
      null,
    );
    return matches;
  }
}
