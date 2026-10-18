import { afterEach, describe, expect, it, vi } from 'vitest';
import { wordAtPoint } from '../src/lib/word-at-point';

function page(text: string, offset: number, firefox = false) {
  const node = { nodeType: 3, textContent: text };
  const range = {
    setStart: vi.fn(), setEnd: vi.fn(),
    getClientRects: () => [{ left: 10, right: 80, top: 10, bottom: 30 }],
  };
  const doc = {
    createRange: () => range,
    ...(firefox
      ? { caretPositionFromPoint: () => ({ offsetNode: node, offset }) }
      : { caretRangeFromPoint: () => ({ startContainer: node, startOffset: offset }) }),
  } as unknown as Document;
  return { doc, range, node };
}

afterEach(() => vi.unstubAllGlobals());

describe('wordAtPoint', () => {
  it('extracts German words with umlauts and ignores surrounding punctuation', () => {
    vi.stubGlobal('Node', { TEXT_NODE: 3 });
    const { doc, range, node } = page('Hallo, Grüße!', 9);
    expect(wordAtPoint(doc, 20, 20)).toBe('Grüße');
    expect(range.setStart).toHaveBeenCalledWith(node, 7);
    expect(range.setEnd).toHaveBeenCalledWith(node, 12);
  });

  it('supports caretPositionFromPoint and hyphenated words', () => {
    vi.stubGlobal('Node', { TEXT_NODE: 3 });
    expect(wordAtPoint(page('E-Mail schreiben', 3, true).doc, 20, 20)).toBe('E-Mail');
  });

  it('does not translate nearby words when clicking empty space', () => {
    vi.stubGlobal('Node', { TEXT_NODE: 3 });
    expect(wordAtPoint(page('Hallo', 5).doc, 100, 20)).toBeUndefined();
  });

  it('ignores punctuation and browsers without caret APIs', () => {
    vi.stubGlobal('Node', { TEXT_NODE: 3 });
    expect(wordAtPoint(page('Hallo ... Welt', 8).doc, 20, 20)).toBeUndefined();
    expect(wordAtPoint({} as Document, 20, 20)).toBeUndefined();
  });
});
