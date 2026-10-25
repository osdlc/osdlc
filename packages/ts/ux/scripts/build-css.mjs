// Writes dist/tokens.css from the built module, so the file and the
// `tokensCss` string are the same text.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { tokensCss } from '../dist/index.js'

writeFileSync(fileURLToPath(new URL('../dist/tokens.css', import.meta.url)), tokensCss)
