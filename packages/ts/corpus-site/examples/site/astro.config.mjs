// Build the example site from the package folder with `pnpm run example`.
import vue from '@astrojs/vue'
import { corpusSite } from '@osdlc/corpus-site'
import { defineConfig } from 'astro/config'

export default defineConfig({
  integrations: [
    vue(),
    corpusSite({
      root: '../corpus',
      description: 'A shelf of books, their writers and some notes.',
      // The field metadata is in corpus-site.config.json, beside this file.
      components: { Footer: './src/components/Footer.astro' },
      customCss: ['./src/theme.css'],
    }),
  ],
})
