// Example sentences in lesson MDX mark the part to notice with **double asterisks**.

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The highlight for the part of a sentence to notice. */
export const NOTICE = 'rounded-sm bg-accent-soft px-0.5';

/** Escaped HTML with the **marked** parts in <strong>. */
export const mark = (text: string, strongClass = '') =>
  escape(text).replace(/\*\*(.+?)\*\*/g, strongClass ? `<strong class="${strongClass}">$1</strong>` : '<strong>$1</strong>');

/** The sentence without its marks, for speaking it aloud. */
export const plain = (text: string) => text.replace(/\*\*/g, '');
