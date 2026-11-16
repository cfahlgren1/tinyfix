const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const VOWELS = new Set("aeiou");

const COST = {
  swap: 1.2,
  doubledKey: 1.2,
  adjacentKey: 1.6,
  vowelForVowel: 2,
  extraNearbyKey: 1.8,
  missedKey: 2.4,
  extraKey: 3,
  wrongKey: 3.4,
  firstLetterPenalty: 1.5,
} as const;

function buildNeighbors(): Map<string, Set<string>> {
  const neighbors = new Map<string, Set<string>>();
  KEYBOARD_ROWS.forEach((row, rowIndex) => {
    [...row].forEach((key, keyIndex) => {
      const near = new Set<string>();
      for (const [otherRow, shift] of [
        [rowIndex, -1],
        [rowIndex, 1],
        [rowIndex - 1, 0],
        [rowIndex - 1, 1],
        [rowIndex + 1, -1],
        [rowIndex + 1, 0],
      ] as const) {
        const other = KEYBOARD_ROWS[otherRow]?.[keyIndex + shift];
        if (other) near.add(other);
      }
      neighbors.set(key, near);
    });
  });
  return neighbors;
}

const NEIGHBORS = buildNeighbors();

const isNearby = (first: string | undefined, second: string | undefined): boolean =>
  !!first && !!second && !!NEIGHBORS.get(first)?.has(second);

function substitutionCost(typed: string, intended: string): number {
  if (isNearby(typed, intended)) return COST.adjacentKey;
  if (VOWELS.has(typed) && VOWELS.has(intended)) return COST.vowelForVowel;
  return COST.wrongKey;
}

function extraKeyCost(typed: string, position: number): number {
  const key = typed[position]!;
  if (key === typed[position - 1] || key === typed[position + 1]) return COST.doubledKey;
  if (isNearby(key, typed[position - 1]) || isNearby(key, typed[position + 1])) return COST.extraNearbyKey;
  return COST.extraKey;
}

function missedKeyCost(intended: string, position: number): number {
  return intended[position] === intended[position - 1] ? COST.doubledKey : COST.missedKey;
}

/** A slip on a word's first letter is less likely, so it costs more. */
const start = (position: number) => (position === 0 ? COST.firstLetterPenalty : 0);

/** Weighted edit distance: a lower cost means the typo is a more believable slip of the fingers. */
export function typoCost(typed: string, intended: string): number {
  const rows = typed.length + 1;
  const columns = intended.length + 1;
  const table: number[][] = Array.from({ length: rows }, () => new Array<number>(columns).fill(0));

  for (let row = 1; row < rows; row++)
    table[row]![0] = table[row - 1]![0]! + extraKeyCost(typed, row - 1) + start(row - 1);
  for (let column = 1; column < columns; column++)
    table[0]![column] = table[0]![column - 1]! + missedKeyCost(intended, column - 1) + start(column - 1);

  for (let row = 1; row < rows; row++) {
    for (let column = 1; column < columns; column++) {
      const typedKey = typed[row - 1]!;
      const intendedKey = intended[column - 1]!;
      const firstLetter = start(Math.min(row, column) - 1);
      const replace = typedKey === intendedKey ? 0 : substitutionCost(typedKey, intendedKey) + firstLetter;
      let best = Math.min(
        table[row - 1]![column]! + extraKeyCost(typed, row - 1) + firstLetter,
        table[row]![column - 1]! + missedKeyCost(intended, column - 1) + firstLetter,
        table[row - 1]![column - 1]! + replace,
      );
      const swapped = row > 1 && column > 1 && typedKey === intended[column - 2] && typed[row - 2] === intendedKey;
      if (swapped) best = Math.min(best, table[row - 2]![column - 2]! + COST.swap);
      table[row]![column] = best;
    }
  }
  return table[rows - 1]![columns - 1]!;
}
