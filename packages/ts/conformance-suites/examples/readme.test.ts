/**
 * The README's examples, run through the package name: check a repository
 * from code, and the same through `main`, as the `conformance-suites` command does.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { checkRepo, main, suiteProblems, versionProblems } from '@osdlc/conformance-suites'

let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'conformance-example-'))
  const put = (file: string, text: string) => {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), text)
  }
  put(
    'packages/conformance/families.json',
    JSON.stringify({
      'gfm-table': {
        reference: 'ts',
        generator: 'pnpm --filter @acme/gfm-table conformance:write',
        implementations: [
          { language: 'ts', dir: 'packages/ts/gfm-table', name: '@acme/gfm-table' },
        ],
      },
    }),
  )
  put('packages/conformance/gfm-table/README.md', '# gfm-table\n')
  put('packages/conformance/gfm-table/SPEC.md', '# gfm-table\n')
  put(
    'packages/conformance/gfm-table/suite.json',
    JSON.stringify({
      family: 'gfm-table',
      reference: 'ts',
      referenceVersion: '0.4.0',
      sections: {
        split_row: {
          description: 'Split one table row into cells.',
          cases: [
            { name: 'two cells', input: { line: '| a | b |' }, expect: { cells: ['a', 'b'] } },
          ],
        },
      },
    }),
  )
  put(
    'packages/ts/gfm-table/package.json',
    JSON.stringify({ name: '@acme/gfm-table', version: '0.4.1' }),
  )
  put(
    'packages/ts/gfm-table/tests/conformance.test.ts',
    "const suite = '../../../conformance/gfm-table/suite.json'",
  )
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

test('check a repository from code', () => {
  expect(checkRepo(root)).toEqual([])
})

test('check through the command', () => {
  const out: string[] = []
  const code = main(['check', '--root', root], { out: (l) => out.push(l), err: (l) => out.push(l) })
  expect(code).toBe(0)
  expect(out).toEqual(['conformance suites pass'])
})

test('the pure checks take data', () => {
  expect(suiteProblems('suite.json', { family: 'x' }, 'x', 'ts')[0]).toBe(
    'suite.json: reference is undefined, not ts',
  )
  expect(versionProblems('x', { ts: '0.4.0', rust: '0.5.0' })).toEqual([
    'x: implementations do not share major.minor: ts 0.4.0, rust 0.5.0',
  ])
})
