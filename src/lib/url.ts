/** Prefix an internal path with the site base, e.g. url('a2/') -> '/German/a2/'. */
export function url(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const clean = path.replace(/^\/+/, '');
  return `${base}/${clean}`;
}
