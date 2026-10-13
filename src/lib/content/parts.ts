/** Chapters up to this many exercises are practised in one part. */
export const ONE_PART_MAX = 15;

/**
 * A chapter's exercise sets grouped into one or two parts, as set indices.
 * Learners stop after the first sitting, so there are never more than two.
 * The split falls between sets, as close to half way as the set sizes allow.
 */
export function splitParts(sizes: readonly number[]): number[][] {
  const indices = sizes.map((_, index) => index);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (total <= ONE_PART_MAX || sizes.length < 2) return [indices];
  let best = 1;
  let bestGap = Infinity;
  let before = 0;
  for (let cut = 1; cut < sizes.length; cut++) {
    before += sizes[cut - 1]!;
    const gap = Math.abs(before - total / 2);
    if (gap < bestGap) [best, bestGap] = [cut, gap];
  }
  return [indices.slice(0, best), indices.slice(best)];
}
