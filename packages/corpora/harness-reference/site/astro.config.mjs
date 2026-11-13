// The harness reference as a static site. The corpus is ../corpus; what the site adds to its
// schemas is in corpus-site.config.ts.
import vue from '@astrojs/vue'
import { corpusSite } from '@osdlc/corpus-site'
import { defineConfig } from 'astro/config'

export default defineConfig({
  integrations: [vue(), corpusSite({ root: '../corpus' })],
})
