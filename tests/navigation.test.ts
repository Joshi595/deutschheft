import { describe, expect, it } from 'vitest';
import { AREAS, resolveLocation } from '../src/lib/navigation';
import { lightAppearance } from '../src/lib/appearance';

describe('page location', () => {
  it.each(AREAS)('identifies the $label landing page', ({ id, path, label }) => {
    expect(resolveLocation(`/deutschheft/${path}`, '/deutschheft/', label).area).toBe(id);
  });
  it.each([
    ['a1/01-begruessung/', 'learn'], ['a2/checkpoint/1/', 'learn'],
    ['b1/exam/modelltest-01/', 'learn'], ['b2/', 'learn'],
    ['speak/sounds/ue/', 'speak'], ['speak/conversations/weg/', 'speak'],
    ['speak/exam/a1/', 'speak'], ['missions/baeckerei/', 'speak'],
    ['progress/', 'progress'], ['settings/', 'settings'],
  ])('keeps /%s in its parent area', (path, area) => {
    expect(resolveLocation(`/deutschheft/${path}`, '/deutschheft/').area).toBe(area);
  });
  it('builds breadcrumbs for lessons, conversations, and exams', () => {
    expect(resolveLocation('/deutschheft/a1/01-begruessung/', '/deutschheft', 'Greetings').breadcrumbs).toEqual([
      { label: 'Learn', href: 'learn/' }, { label: 'A1', href: 'a1/' }, { label: 'Greetings' },
    ]);
    expect(resolveLocation('/speak/conversations/weg/', '/', 'Directions').breadcrumbs).toEqual([
      { label: 'Speak', href: 'speak/' }, { label: 'Conversations', href: 'speak/conversations/' }, { label: 'Directions' },
    ]);
    expect(resolveLocation('/b1/exam/test/', '/', 'Test').breadcrumbs[2]).toEqual({ label: 'Mock exams', href: 'b1/#mock-exams' });
  });
  it('supports root hosting and a base without a trailing slash', () => {
    expect(resolveLocation('/', '/').area).toBe('today');
    expect(resolveLocation('/deutschheft', '/deutschheft').area).toBe('today');
    expect(resolveLocation('/settings/', '/').area).toBe('settings');
  });
  it('does not mark an unrelated or missing page as Learn', () => {
    expect(resolveLocation('/deutschheft/unknown/', '/deutschheft', 'Page not found')).toEqual({
      area: undefined, breadcrumbs: [{ label: 'Page not found' }],
    });
  });
});

describe('light appearance compatibility', () => {
  it.each(['dark', 'system', 'light', undefined])('normalizes %s while preserving the rest', (theme) => {
    const saved = { theme, level: 'b1', dailyGoal: 100, voice: 'German', aiKey: 'test-value' };
    expect(lightAppearance(saved)).toEqual({ ...saved, theme: 'light' });
    expect(saved.theme).toBe(theme);
  });
});
