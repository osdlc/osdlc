import type { CatalogueLayer } from '../src/catalogue/types.ts'
import type { expandChain } from '../src/chains.ts'

/** Three image-output models in the fast/standard family: one without tool calling, one that calls tools, and one embedding model. */
export const IMAGE: CatalogueLayer = {
  source: 'config',
  observed_at: '2026-10-09',
  models: {
    'google/test-image': {
      family: 'gemini-flash',
      release_date: '2026-10-08',
      traits: ['vision', 'image-out'],
      status: 'current',
    },
    'google/test-image-agent': {
      family: 'gemini-flash',
      release_date: '2026-10-07',
      traits: ['agent', 'image-out'],
      status: 'current',
    },
    'google/test-image-embed': {
      family: 'gemini-flash',
      release_date: '2026-10-06',
      traits: ['embedding', 'image-out'],
      status: 'current',
    },
  },
}

/** The model keys of a chain's entries. */
export const names = (c: ReturnType<typeof expandChain>) => c.entries.map((e) => e.model)
