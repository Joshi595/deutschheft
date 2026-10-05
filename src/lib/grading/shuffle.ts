function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Shuffle deterministically from a seed (the exercise id), so the order is the
 * same on every render but not the order the author wrote.
 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const result = [...items];
  let state = hash(seed);
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  // A shuffle that lands on the original order would give the answer away.
  if (result.length > 1 && result.every((item, i) => item === items[i])) {
    result.push(result.shift()!);
  }
  return result;
}

/** Split a sentence into tiles for a word-order exercise. */
export function tokenize(sentence: string): string[] {
  return sentence
    .trim()
    .replace(/[.!?]+$/, '')
    .split(/\s+/)
    .filter(Boolean);
}
