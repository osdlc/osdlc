import { readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

import { builtins } from '../src/builtins.ts'
import { compilePattern, pathIndex } from '../src/pattern.ts'
import { buildRegistry, markersOf } from '../src/registry.ts'

const PATHS = [
  'package.json',
  'apps/web/package.json',
  'apps/web/src/package.json.bak',
  'Cargo.toml',
  'crates/a/Cargo.toml',
  'build.sbt',
  'sub/build.sbt',
  '.github/workflows/ci.yml',
  '.github/workflows/nested/x.yml',
  'mise-tasks/build',
  'mise-tasks/sub/test',
  'a/mise-tasks/deep',
  'App.csproj',
  'src/Lib.csproj',
  'mise.toml',
  'x/mise.toml',
  'node_modules/a/index.js',
  'apps/node_modules/b/package.json',
  'apps/api/package.json',
  'x',
]

/** What a full scan matches: the answer the index must give. */
const scan = (pattern: string): string[] =>
  PATHS.filter((p) => compilePattern(pattern).base(p) !== null)

const viaIndex = (pattern: string): string[] => {
  const compiled = compilePattern(pattern)
  return pathIndex(PATHS)
    .candidates(compiled)
    .map((i) => PATHS[i]!)
    .filter((p) => compiled.base(p) !== null)
}

describe('pathIndex', () => {
  test.each([
    'package.json',
    'Cargo.toml',
    '*.csproj',
    '/*.sbt',
    '/.github/workflows/*.yml',
    '/mise-tasks/',
    '/mise.toml',
    'mise.toml',
    'missing.txt',
    '*',
    'node_modules/',
    '/apps/*/package.json',
    '//x',
    '/x',
  ])('%s matches what a full scan matches, in list order', (pattern) => {
    expect(viaIndex(pattern)).toEqual(scan(pattern))
  })

  test('a file pattern is not tested against every path', () => {
    const index = pathIndex(PATHS)
    expect(index.candidates(compilePattern('Cargo.toml'))).toEqual([3, 4])
    // Anchored: only the paths at the pattern's depth.
    expect(index.candidates(compilePattern('/.github/workflows/*.yml'))).toEqual([
      1, 4, 7, 10, 11, 16, 18,
    ])
  })
})

/** Every file under `dir`, root-relative with `/`, skipping node_modules. */
function walk(dir: string, root = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full, root)
    return [relative(root, full).split(sep).join('/')]
  })
}

test("every built-in marker and manifest pattern matches what a full scan does on this package's tree", () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const paths = walk(root)
  const registry = buildRegistry(builtins)
  const patterns = [
    ...registry.ecosystems.flatMap((e) => e.manifests.map((m) => m.files)),
    ...registry.tools.flatMap((t) => markersOf(t).map((m) => m.files)),
  ]
  expect(patterns.length).toBeGreaterThan(50)
  const index = pathIndex(paths)
  for (const pattern of patterns) {
    const compiled = compilePattern(pattern)
    const viaScan = paths.filter((p) => compiled.base(p) !== null)
    const viaIndex = index
      .candidates(compiled)
      .map((i) => paths[i]!)
      .filter((p) => compiled.base(p) !== null)
    expect(viaIndex, pattern).toEqual(viaScan)
  }
})
