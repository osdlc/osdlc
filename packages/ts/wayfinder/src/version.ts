/** wayfinder's version, read from its own package.json. */

import { readFileSync } from 'node:fs'

/**
 * The `version` of the package this module is in. The source and the built
 * `dist/` both sit one level below `package.json`.
 */
export const VERSION: string = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string
  }
).version
