import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { splitParts } from '../src/lib/content/parts';

describe('splitParts', () => {
  it('keeps a short chapter in one part', () => {
    expect(splitParts([4, 4, 4])).toEqual([[0, 1, 2]]);
    expect(splitParts([20])).toEqual([[0]]);
  });

  it('splits a longer chapter in two, between sets, near half way', () => {
    expect(splitParts([4, 4, 4, 4, 4, 4])).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
    expect(splitParts([8, 1, 1, 1, 1, 8])).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
  });

  it('gives every chapter of the course at most two parts of a reasonable size', () => {
    const root = join(import.meta.dirname, '..', 'src', 'content', 'exercises');
    for (const level of readdirSync(root)) {
      for (const file of readdirSync(join(root, level))) {
        const { sets } = parse(readFileSync(join(root, level, file), 'utf8')) as { sets: { items: unknown[] }[] };
        const sizes = sets.map((set) => set.items.length);
        const parts = splitParts(sizes);
        expect(parts.length, file).toBeLessThanOrEqual(2);
        expect(parts.flat(), file).toEqual(sizes.map((_, index) => index));
        for (const part of parts) {
          expect(part.reduce((sum, index) => sum + sizes[index]!, 0), `${level}/${file}`).toBeGreaterThanOrEqual(5);
        }
      }
    }
  });
});
