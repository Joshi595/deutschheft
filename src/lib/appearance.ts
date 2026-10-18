/** Accept legacy appearance values without changing other saved preferences. */
export function lightAppearance<T extends object>(settings: T): T & { theme: 'light' } {
  return { ...settings, theme: 'light' };
}
