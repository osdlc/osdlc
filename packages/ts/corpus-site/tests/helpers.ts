/** The example corpus as a site. Not for jsdom tests: jsdom replaces the global URL. */
import { fileURLToPath } from 'node:url'
import type { CorpusSiteConfig } from '../src/config.ts'
import { loadSite, type Site } from '../src/site.ts'

/** The reading-list corpus in examples/. */
export const CORPUS = fileURLToPath(new URL('../examples/corpus', import.meta.url))

/** The example corpus as a site. */
export const exampleSite = (config: CorpusSiteConfig = {}, base = '/'): Site =>
  loadSite(CORPUS, { config, base })
