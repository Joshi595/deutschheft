import type { APIRoute } from 'astro';
import { getCatalog } from '../../lib/content/catalog';

// Every sentence that can be practised aloud, as one static file. The sentence
// session fetches it once; the offline cache keeps it after that.
export const GET: APIRoute = async () =>
  new Response(JSON.stringify((await getCatalog()).bank), { headers: { 'Content-Type': 'application/json' } });