const PUNCTUATION = /[.,!?;:"'„“”‚‘’()]/g;

/** Trim, collapse whitespace and drop punctuation, keeping capitalisation. */
export function clean(text: string): string {
  return text.normalize('NFC').replace(PUNCTUATION, ' ').replace(/\s+/g, ' ').trim();
}

/** Comparison form: cleaned and lower-cased. */
export function normalize(text: string): string {
  return clean(text).toLowerCase();
}

/** Keyboard spelling of umlauts: ä -> ae, ö -> oe, ü -> ue, ß -> ss. */
export function transliterate(text: string): string {
  return text
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

/** Umlauts dropped altogether. Used only to detect a near miss, never to accept. */
export function stripUmlauts(text: string): string {
  return text
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss');
}

/** Edit distance, capped: returns `limit + 1` as soon as the distance exceeds `limit`. */
export function editDistance(a: string, b: string, limit = 2): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length]!;
}
