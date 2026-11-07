/**
 * The README's list of experimental items agrees with the `@experimental`
 * markers in the source.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import * as pkg from '@osdlc/ref-lease'

const root = join(import.meta.dirname, '..')

function markedExperimental(): string[] {
  const names: string[] = []
  for (const file of readdirSync(join(root, 'src'))) {
    const text = readFileSync(join(root, 'src', file), 'utf8')
    const re =
      /\/\*\*(?:(?!\*\/)[\s\S])*@experimental(?:(?!\*\/)[\s\S])*\*\/\s*export (?:const|function|type|interface|class) (\w+)/g
    for (const m of text.matchAll(re)) names.push(m[1]!)
  }
  return names.sort()
}

function listedInReadme(): string[] {
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  const section = /## Stability\n([\s\S]*?)\n## /.exec(readme)?.[1] ?? ''
  return [...section.matchAll(/^- `(\w+)`/gm)].map((m) => m[1]!).sort()
}

test('the README lists exactly the items marked @experimental', () => {
  expect(markedExperimental().length).toBeGreaterThan(0)
  expect(listedInReadme()).toEqual(markedExperimental())
})

test('every experimental item is exported', () => {
  for (const name of markedExperimental()) {
    if (/^[A-Z][a-z]/.test(name) && !(name in pkg)) continue // a type: erased at runtime
    expect(pkg).toHaveProperty(name)
  }
})
