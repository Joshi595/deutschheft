// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

// Served from GitHub Pages at https://joshi595.github.io/deutschheft/.
// If the repo is renamed or moved to a custom domain, change `site` and `base` here only.
const base = '/deutschheft';

export default defineConfig({
  site: 'https://joshi595.github.io',
  base,
  trailingSlash: 'always',
  // Missions are listed with the conversations of the Speak section; old links to their own list still arrive.
  // A redirect target is not prefixed with the base by Astro, so it is written out here.
  redirects: { '/missions': `${base}/speak/conversations/` },
  integrations: [react(), mdx()],

  vite: {
    plugins: [tailwindcss()]
  }
});
