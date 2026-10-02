// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

// Served from GitHub Pages at https://joshi595.github.io/German/.
// If the repo is renamed or moved to a custom domain, change `site` and `base` here only.
export default defineConfig({
  site: 'https://joshi595.github.io',
  base: '/German',
  trailingSlash: 'always',
  integrations: [react(), mdx()],

  vite: {
    plugins: [tailwindcss()]
  }
});
