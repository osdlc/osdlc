import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from 'vitest'

// The README says a browser bundle can import `createVaultIndex`. That holds
// only while no module in src/ imports a `node:` module statically.
test('no module in src/ imports a node: module at the top level', () => {
  const dir = join(import.meta.dirname, '..', 'src')
  const offenders = readdirSync(dir)
    .filter((file) => file.endsWith('.ts'))
    .filter((file) =>
      /^\s*(import|export)\b[^\n]*\bfrom\s+['"]node:/m.test(readFileSync(join(dir, file), 'utf-8')),
    )
  expect(offenders).toEqual([])
})
