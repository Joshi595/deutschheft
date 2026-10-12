import { readFileSync } from 'node:fs';
import { clipKey } from '../speech';

/** Build-time only: which texts have a recorded clip, from public/audio/index.json, read once. */
let keys: Set<string> | undefined;

export function hasClip(text: string): boolean {
  keys ??= new Set(Object.values(JSON.parse(readFileSync('public/audio/index.json', 'utf8')) as Record<string, string[]>).flat());
  return keys.has(clipKey(text));
}
