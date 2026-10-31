/**
 * `ATTACHMENT_EXTENSIONS` is the same list as the Rust crate's constant of the
 * same name, read from the crate's source beside this package.
 */
import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

import { ATTACHMENT_EXTENSIONS } from '../src/index.ts'

test('the list matches the Rust crate', () => {
  const source = readFileSync(
    new URL('../../../rust/markdown-link/src/lib.rs', import.meta.url),
    'utf8',
  )
  const body = /pub const ATTACHMENT_EXTENSIONS: &\[&str\] = &\[([^\]]*)\];/.exec(source)?.[1]
  expect(body).toBeDefined()
  const rust = [...body!.matchAll(/"([^"]+)"/g)].map((m) => m[1])
  expect(rust.length).toBeGreaterThan(0)
  expect([...ATTACHMENT_EXTENSIONS]).toEqual(rust)
})
