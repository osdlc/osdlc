import { readFileSync } from 'node:fs'

import type { Knowledge } from './knowledge.js'

let cached: Knowledge | undefined

/** Where the shipped `data/` folder is, from both `src/` and `dist/`. */
export const DATA_DIR = new URL('../data/', import.meta.url)

/** The compiled knowledge file shipped with this package. Read once, then cached. */
export function loadKnowledge(): Knowledge {
  cached ??= JSON.parse(
    readFileSync(new URL('harness-knowledge.json', DATA_DIR), 'utf-8'),
  ) as Knowledge
  return cached
}
