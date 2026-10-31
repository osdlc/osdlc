// Tests for conformance.ts.
//
//   node --test scripts/conformance.test.ts
import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'

import {
  checkRepo,
  generatorBuildFilters,
  majorMinor,
  readsAcross,
  registryProblems,
  suiteProblems,
  suiteReaders,
  versionProblems,
} from './conformance.ts'

const FAMILY = {
  reference: 'ts',
  generator: 'pnpm --filter @x/dirs conformance:write',
  implementations: [
    { language: 'ts', dir: 'packages/ts/dirs', name: '@x/dirs' },
    { language: 'rust', dir: 'packages/rust/dirs', name: 'dirs' },
  ],
}

const SUITE = {
  family: 'dirs',
  reference: 'ts',
  referenceVersion: '0.2.0',
  sections: {
    resolve: {
      description: 'Resolve a directory.',
      cases: [
        { name: 'plain', input: { a: 1 }, expect: { relative: 'x' } },
        { name: 'refused', input: { a: '' }, error: { kind: 'invalid_key' } },
        { name: 'unix only', input: {}, expect: {}, platforms: ['unix'], skip: { rust: 'not built yet' } },
      ],
    },
  },
}

test('a good registry has no problems', () => {
  assert.deepEqual(registryProblems({ dirs: FAMILY }), [])
})

test('the registry names its reference, its generator and two implementations', () => {
  assert.deepEqual(registryProblems({ dirs: { ...FAMILY, reference: 'go' } }), [
    'dirs: the reference go is not one of its implementations',
  ])
  assert.deepEqual(registryProblems({ dirs: { ...FAMILY, generator: 'node write.ts' } }), [
    'dirs: the generator is `pnpm --filter @x/dirs conformance:write`',
  ])
  assert.deepEqual(registryProblems({ dirs: { ...FAMILY, implementations: FAMILY.implementations.slice(0, 1) } }), [
    'dirs: a family has at least two implementations',
  ])
  const rust = {
    ...FAMILY,
    reference: 'rust',
    generator: 'cargo run -p dirs --example conformance-write',
  }
  assert.deepEqual(registryProblems({ dirs: rust }), [])
  const misplaced = { ...FAMILY, implementations: [FAMILY.implementations[0], { ...FAMILY.implementations[1], dir: 'packages/ts/dirs-rs' }] }
  assert.deepEqual(registryProblems({ dirs: misplaced }), ['dirs: packages/ts/dirs-rs is not under packages/rust/'])
  assert.deepEqual(registryProblems({ Dirs: FAMILY }).slice(0, 1), ['Dirs: a family name is lower-case and dash-separated'])
})

test('regenerating builds each TypeScript reference and what it depends on, not a Rust one', () => {
  const rust = {
    reference: 'rust',
    generator: 'cargo run -p glob --example conformance-write',
    implementations: [
      { language: 'rust', dir: 'packages/rust/glob', name: 'glob' },
      { language: 'ts', dir: 'packages/ts/glob', name: '@x/glob' },
    ],
  }
  const lines = {
    ...FAMILY,
    generator: 'pnpm --filter @x/lines conformance:write',
    implementations: [{ language: 'ts', dir: 'packages/ts/lines', name: '@x/lines' }],
  }
  const families = { dirs: FAMILY, glob: rust, lines }
  const both = ['--filter', '@x/dirs...', '--filter', '@x/lines...']
  assert.deepEqual(generatorBuildFilters(families, undefined), both)
  assert.deepEqual(generatorBuildFilters(families, 'ts'), both)
  assert.deepEqual(generatorBuildFilters(families, 'rust'), [])
})

test('a good suite has no problems', () => {
  assert.deepEqual(suiteProblems('s.json', SUITE, 'dirs', 'ts'), [])
})

test('a suite names its family and reference', () => {
  assert.deepEqual(suiteProblems('s.json', { ...SUITE, family: 'other', reference: 'rust' }, 'dirs', 'ts'), [
    's.json: family is other, not dirs',
    's.json: reference is rust, not ts',
  ])
})

test('a case has a name, an input, and one of expect and error', () => {
  const with_ = (c: object) => ({ ...SUITE, sections: { s: { description: 'd', cases: [c] } } })
  assert.deepEqual(suiteProblems('f', with_({ name: 'a', input: {} }), 'dirs', 'ts'), [
    'f: s: a: give exactly one of expect and error',
  ])
  assert.deepEqual(suiteProblems('f', with_({ name: 'a', input: {}, expect: {}, error: { kind: 'k' } }), 'dirs', 'ts'), [
    'f: s: a: give exactly one of expect and error',
  ])
  assert.deepEqual(suiteProblems('f', with_({ input: {}, expect: {} }), 'dirs', 'ts'), ['f: s: case 0: no name'])
  assert.deepEqual(suiteProblems('f', with_({ name: 'a', expect: {} }), 'dirs', 'ts'), ['f: s: a: no input'])
  assert.deepEqual(suiteProblems('f', with_({ name: 'a', input: {}, expected: {} }), 'dirs', 'ts'), [
    'f: s: a: unknown keys expected',
    'f: s: a: give exactly one of expect and error',
  ])
  assert.deepEqual(suiteProblems('f', with_({ name: 'a', input: {}, error: { kind: '' } }), 'dirs', 'ts'), [
    'f: s: a: error.kind is not a string',
  ])
})

test('a skip gives a reason, and platforms are known', () => {
  const with_ = (c: object) => ({ ...SUITE, sections: { s: { description: 'd', cases: [{ name: 'a', input: {}, expect: {}, ...c }] } } })
  assert.deepEqual(suiteProblems('f', with_({ skip: { rust: ' ' } }), 'dirs', 'ts'), ['f: s: a: a skip for rust needs a reason'])
  assert.deepEqual(suiteProblems('f', with_({ skip: { go: 'later' } }), 'dirs', 'ts'), ['f: s: a: skip names an unknown language go'])
  assert.deepEqual(suiteProblems('f', with_({ platforms: ['linux'] }), 'dirs', 'ts'), [
    'f: s: a: platforms is a non-empty list of unix, windows',
  ])
  assert.deepEqual(suiteProblems('f', with_({ tolerance: 0 }), 'dirs', 'ts'), ['f: s: a: tolerance is a positive number'])
})

test('two cases in a section may not share a name', () => {
  const cases = [
    { name: 'a', input: {}, expect: {} },
    { name: 'a', input: {}, expect: {} },
  ]
  assert.deepEqual(suiteProblems('f', { ...SUITE, sections: { s: { description: 'd', cases } } }, 'dirs', 'ts'), [
    'f: s: a: two cases have this name',
  ])
})

test('implementations share major.minor', () => {
  assert.equal(majorMinor('1.12.3'), '1.12')
  assert.deepEqual(versionProblems('dirs', { a: '0.4.1', b: '0.4.0' }), [])
  assert.deepEqual(versionProblems('dirs', { a: '0.5.0', b: '0.4.0' }), [
    'dirs: implementations do not share major.minor: a 0.5.0, b 0.4.0',
  ])
})

test('suite readers and cross-language reads are found in test sources', () => {
  const readers = suiteReaders(
    new Map([
      ['packages/ts/dirs', ["const p = '../../../conformance/dirs/suite.json'"]],
      ['packages/rust/dirs', ['include_str!("../../../conformance/dirs/resolve.json")']],
      ['packages/ts/none', ['nothing here']],
    ]),
  )
  assert.deepEqual([...readers].map(([d, f]) => [d, [...f]]), [
    ['packages/ts/dirs', ['dirs']],
    ['packages/rust/dirs', ['dirs']],
  ])
  assert.equal(readsAcross('packages/ts/x', ["'../../../rust/x/tests/fixtures/parity.json'"]), true)
  assert.equal(readsAcross('packages/rust/x', ['"../../ts/x/corpus/a.md"']), true)
  assert.equal(readsAcross('packages/ts/x', ["'./fixtures/a.json'"]), false)
})

/** A repository on disk with one family, `edit` changing files before the check. */
function repo(edit: (put: (file: string, text: string) => void) => void = () => {}): string[] {
  const root = mkdtempSync(join(tmpdir(), 'conformance-'))
  const put = (file: string, text: string) => {
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
    return checkRepo(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('a conforming repository has no problems', () => {
  assert.deepEqual(repo(), [])
})

test('a repository check finds an unread suite, an unlisted reader, version drift and a stray fixture read', () => {
  assert.deepEqual(
    repo((put) => {
      put('packages/rust/dirs/tests/c.rs', '// reads nothing')
      put('packages/ts/other/tests/x.test.ts', "'../../../conformance/dirs/suite.json'")
    }),
    [
      'dirs: no test under packages/rust/dirs/tests names packages/conformance/dirs/',
      'packages/ts/other: reads the dirs suite but families.json does not list it',
    ],
  )
  assert.deepEqual(
    repo((put) => put('packages/rust/dirs/Cargo.toml', '[package]\nname = "dirs"\nversion = "0.3.0"\n')),
    ['dirs: implementations do not share major.minor: packages/ts/dirs 0.2.3, packages/rust/dirs 0.3.0'],
  )
  assert.deepEqual(
    repo((put) => put('packages/ts/stray/tests/x.test.ts', "'../../../rust/stray/tests/fixtures/parity.json'")),
    ["packages/ts/stray: reads the other language's fixtures; move them to a suite in packages/conformance/"],
  )
})
