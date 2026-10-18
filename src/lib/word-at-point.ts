/** Read only the word directly under a click, without changing the user's selection. */
export function wordAtPoint(doc: Document, x: number, y: number): string | undefined {
  const browserDoc = doc as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = browserDoc.caretPositionFromPoint?.(x, y);
  const caret = position ? undefined : browserDoc.caretRangeFromPoint?.(x, y);
  const node = position?.offsetNode ?? caret?.startContainer;
  const offset = position?.offset ?? caret?.startOffset;
  if (!node || node.nodeType !== Node.TEXT_NODE || offset === undefined) return;
  const text = node.textContent ?? '';
  for (const match of text.matchAll(/[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*/gu)) {
    const start = match.index;
    const end = start + match[0].length;
    if (offset < start || offset > end) continue;
    const range = doc.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    // Caret APIs snap to nearby text even when the click is in empty space.
    if (Array.from(range.getClientRects()).some((rect) =>
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom,
    )) return match[0];
  }
}
