import { describe, expect, test } from 'vitest'

import { compilePattern, pathIndex } from '../src/pattern.ts'

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
  ])('%s matches what a full scan matches, in list order', (pattern) => {
    expect(viaIndex(pattern)).toEqual(scan(pattern))
  })

  test('a file pattern is not tested against every path', () => {
    const index = pathIndex(PATHS)
    expect(index.candidates(compilePattern('Cargo.toml'))).toEqual([3, 4])
    // Anchored: only the paths at the pattern's depth.
    expect(index.candidates(compilePattern('/.github/workflows/*.yml'))).toEqual([1, 4, 7, 10, 11])
  })
})
