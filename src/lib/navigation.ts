/** Shared identities for the app shell, cards, and nested page locations. */
export const AREAS = [
  { id: 'today', label: 'Today', path: '', description: 'Your daily learning space', icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2ZM8 15l3 3 5-5' },
  { id: 'learn', label: 'Learn', path: 'learn/', description: 'Build your German, step by step', icon: 'M12 6C9 4 6 4 3 4v15c3 0 6 0 9 2 3-2 6-2 9-2V4c-3 0-6 0-9 2Zm0 0v15' },
  { id: 'speak', label: 'Speak', path: 'speak/', description: 'Find your voice in German', icon: 'M9 6a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0ZM6 11a6 6 0 0 0 12 0M12 17v4M8 21h8' },
  { id: 'review', label: 'Review', path: 'review/', description: 'Make what you learn stay with you', icon: 'm17 3 3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4' },
  { id: 'notebook', label: 'Notebook', path: 'notebook/', description: 'A space for your words and ideas', icon: 'M6 3h13v18H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM8 3v18M12 8h4M12 12h4' },
  { id: 'progress', label: 'Progress', path: 'progress/', description: 'See how far you have come', icon: 'M4 20V10h4v10M10 20V4h4v16M16 20V7h4v13M2 20h20' },
  { id: 'settings', label: 'Settings', path: 'settings/', description: 'Make this space yours', icon: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6' },
] as const;

export type Area = (typeof AREAS)[number]['id'];
export interface Breadcrumb { label: string; href?: string }
export interface LocalSection { id: string; label: string; tone?: 'lesson' | 'vocabulary' | 'practice' | 'notes' }
export interface PageLocation { area?: Area; breadcrumbs: Breadcrumb[] }

/** Paths remain relative here so this also works under a different hosting base. */
export function resolveLocation(pathname: string, base: string, title?: string): PageLocation {
  const root = base.replace(/\/+$/, '');
  const relative = pathname === root ? '' : pathname.startsWith(`${root}/`) ? pathname.slice(root.length + 1) : pathname.replace(/^\/+/, '');
  const parts = relative.split('/').filter(Boolean);
  const head = parts[0];
  const area: Area | undefined = !head ? 'today'
    : head === 'missions' ? 'speak'
    : /^[ab][12]$/.test(head) ? 'learn'
    : AREAS.find((item) => item.path === `${head}/`)?.id;
  const identity = AREAS.find((item) => item.id === area);
  if (!identity) return { breadcrumbs: [{ label: title ?? 'Page not found' }] };
  const crumbs: Breadcrumb[] = [{ label: identity.label, href: identity.path }];
  if (/^[ab][12]$/.test(head ?? '')) {
    crumbs.push({ label: head!.toUpperCase(), href: `${head}/` });
    if (parts[1] === 'exam') crumbs.push({ label: 'Mock exams', href: `${head}/#mock-exams` });
    if (parts[1] === 'checkpoint') crumbs.push({ label: 'Checkpoint' });
  } else if (head === 'missions') {
    crumbs.push({ label: 'Conversations', href: 'speak/conversations/' });
  } else if (head === 'speak' && parts.length > 1) {
    const sub = parts[1]!;
    const label = ({ sounds: 'Sounds', sentences: 'Sentences', conversations: 'Conversations', exam: 'Exam speaking' } as Record<string, string>)[sub];
    if (label && (parts.length > 2 || title !== label)) {
      crumbs.push({ label, href: sub === 'exam' ? 'speak/' : `speak/${sub}/` });
    }
  }
  const current = title ?? identity.label;
  if (crumbs.at(-1)?.label !== current) crumbs.push({ label: current });
  else delete crumbs[crumbs.length - 1]!.href;
  return { area, breadcrumbs: crumbs };
}
