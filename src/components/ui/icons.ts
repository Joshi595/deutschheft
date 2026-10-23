/** Interface icons: line drawings on a 24 by 24 grid, drawn after Lucide (ISC licence). */
export const ICONS = {
  today: 'M7 3v3M17 3v3M4 9.5h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM8.5 14.5l2.3 2.3 4.7-4.8',
  learn: 'M12 6.5c-1.8-1.3-4-2-7-2v13c3 0 5.2.7 7 2 1.8-1.3 4-2 7-2v-13c-3 0-5.2.7-7 2Zm0 0v13',
  speak: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6',
  review: 'm17 3 3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4',
  notebook: 'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 0v18M13 8h2.5M13 12h2.5',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5',
  translate: 'M3 5h8M7 3v2M9.5 5c-.6 3.4-2.7 6-5.5 7.5M5.5 8.5c1 1.6 2.6 2.9 4.5 3.5M12.5 21l4-9 4 9M14 18h5',
  swap: 'm17 3 3 3-3 3M4 6h16M7 21l-3-3 3-3M20 18H4',
  listen: 'M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
  check: 'M20 6 9 17l-5-5',
  cross: 'M18 6 6 18M6 6l12 12',
  next: 'm9 18 6-6-6-6',
  back: 'm15 18-6-6 6-6',
  external: 'M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
} as const;

export type IconName = keyof typeof ICONS;
