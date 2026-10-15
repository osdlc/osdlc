/**
 * Every public export, from every entry point, appears in at least one
 * scenario, and scenarios import only from the package's entry points. A new
 * export without a usage example fails here, which is the point: the example
 * is where its ergonomics get tried.
 */

import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { expect, test } from 'bun:test'

import { ENTRY_POINTS, imports, publicExports, scenarios } from './support/scenarios.ts'
import { PACKAGE_DIR } from './support/typecheck.ts'

const entries = ENTRY_POINTS.map(({ specifier, file }) => ({
  specifier,
  exported: publicExports(readFileSync(join(PACKAGE_DIR, file), 'utf-8')).map((e) => e.name),
}))

for (const { specifier, exported } of entries) {
  test(`${specifier} exports something`, () => {
    expect(exported.length).toBeGreaterThan(0)
  })

  test(`every ${specifier} export is used by at least one scenario`, () => {
    const used = new Set(
      scenarios().flatMap((s) =>
        imports(s.source)
          .filter((i) => i.specifier === specifier)
          .flatMap((i) => i.names),
      ),
    )

    expect(exported.filter((name) => !used.has(name))).toEqual([])
  })
}

test('scenarios import the package entry points only, never its modules', () => {
  const specifiers = new Set<string>(ENTRY_POINTS.map((e) => e.specifier))
  const allowed = (specifier: string) =>
    specifiers.has(specifier) || specifier === 'bun:test' || specifier.startsWith('node:')

  const stray = scenarios().flatMap((s) =>
    imports(s.source)
      .filter((i) => !allowed(i.specifier))
      .map((i) => `${basename(s.path)}: ${i.specifier}`),
  )

  expect(stray).toEqual([])
})
