import knowledge from '../data/harness-knowledge.json' with { type: 'json' }

import type { Knowledge } from './knowledge.js'

/**
 * Where the shipped `data/` folder is when this package is loaded from `node_modules`. Nothing
 * here reads it: a bundle's `import.meta.url` is the bundle, so a path built from it points at
 * nothing.
 *
 * @deprecated Import `@osdlc/harness-knowledge/data/harness-knowledge.json`, or call
 * {@link loadKnowledge}.
 */
export const DATA_DIR = new URL('../data/', import.meta.url)

/**
 * The compiled knowledge file shipped with this package. It is a JSON module, so a bundler
 * inlines it and Node loads it from the package.
 */
export function loadKnowledge(): Knowledge {
  return knowledge as unknown as Knowledge
}
