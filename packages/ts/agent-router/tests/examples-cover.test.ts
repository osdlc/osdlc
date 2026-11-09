import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

import * as pkg from '@osdlc/agent-router'

import { experimentalExports, root } from './experimental-exports.ts'

// Every stable value export of the package entry has at least one runnable example.
// A new export fails here until an examples/*.test.ts file uses it.
test('every stable value export of the package is used in an example', () => {
  const dir = join(root, 'examples')
  const examples = readdirSync(dir)
    .filter((file) => file.endsWith('.test.ts'))
    .map((file) => readFileSync(join(dir, file), 'utf8'))
  const experimental = experimentalExports()
  const stable = Object.keys(pkg).filter((name) => !experimental.has(name))
  expect(stable.length).toBeGreaterThan(0)

  const missing = stable.filter(
    (name) => !examples.some((source) => new RegExp(`\\b${name}\\b`).test(source)),
  )
  expect(missing).toEqual([])
})
