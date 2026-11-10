/** The one family the tests use, its suite, and a repository on disk holding them. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { checkRepo } from '@osdlc/conformance-suites'

export const FAMILY = {
  reference: 'ts',
  generator: 'pnpm --filter @x/dirs conformance:write',
  implementations: [
    { language: 'ts', dir: 'packages/ts/dirs', name: '@x/dirs' },
    { language: 'rust', dir: 'packages/rust/dirs', name: 'dirs' },
  ],
}

export const SUITE = {
  family: 'dirs',
  reference: 'ts',
  referenceVersion: '0.2.0',
  sections: {
    resolve: {
      description: 'Resolve a directory.',
      cases: [
        { name: 'plain', input: { a: 1 }, expect: { relative: 'x' } },
        { name: 'refused', input: { a: '' }, error: { kind: 'invalid_key' } },
        {
          name: 'unix only',
          input: {},
          expect: {},
          platforms: ['unix'],
          skip: { rust: 'not built yet' },
        },
      ],
    },
  },
}

/** Writes `text` to `file` under the repository. */
export type Put = (file: string, text: string) => void

/** `checkRepo` on the repository after `edit`. */
export function repo(edit: (put: Put) => void = () => {}): string[] {
  return inRepo(edit, (root) => checkRepo(root))
}

/**
 * `run` on a repository with one conforming family, after `edit` changes its
 * files. The repository is removed afterwards.
 */
export function inRepo<T>(edit: (put: Put) => void, run: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), 'conformance-'))
  const put: Put = (file, text) => {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), text)
  }
  try {
    put('packages/conformance/families.json', JSON.stringify({ dirs: FAMILY }))
    put('packages/conformance/dirs/README.md', '# dirs\n')
    put('packages/conformance/dirs/suite.json', JSON.stringify(SUITE))
    put('packages/ts/dirs/package.json', JSON.stringify({ name: '@x/dirs', version: '0.2.3' }))
    put('packages/ts/dirs/tests/c.test.ts', "readSuite('../../../conformance/dirs/suite.json')")
    put('packages/rust/dirs/Cargo.toml', '[package]\nname = "dirs"\nversion = "0.2.0"\n')
    put('packages/rust/dirs/tests/c.rs', 'include_str!("../../../conformance/dirs/suite.json")')
    edit(put)
    return run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
