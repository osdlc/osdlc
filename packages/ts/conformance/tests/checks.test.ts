import { strict as assert } from 'node:assert'

import { test } from 'vitest'

import {
  bumpVersion,
  configProblems,
  generatorBuildFilters,
  majorMinor,
  pendingBumps,
  readsAcross,
  registryProblems,
  suiteProblems,
  suiteReaders,
  versionProblems,
} from '@osdlc/conformance'

import { FAMILY, SUITE } from './_fixture.ts'

test('a good registry has no problems', () => {
  assert.deepEqual(registryProblems({ dirs: FAMILY }), [])
})

test('the registry names its reference, its generator and its implementations', () => {
  assert.deepEqual(registryProblems({ dirs: { ...FAMILY, reference: 'go' } }), [
    'dirs: the reference go is not one of its implementations',
  ])
  assert.deepEqual(registryProblems({ dirs: { ...FAMILY, generator: 'node write.ts' } }), [
    'dirs: the generator is `pnpm --filter @x/dirs conformance:write`',
  ])
  assert.deepEqual(registryProblems({ dirs: { ...FAMILY, implementations: [] } }), [
    'dirs: a family has at least one implementation',
  ])
  assert.deepEqual(
    registryProblems({ dirs: { ...FAMILY, implementations: FAMILY.implementations.slice(0, 1) } }),
    [],
  )
  const rust = {
    ...FAMILY,
    reference: 'rust',
    generator: 'cargo run -p dirs --example conformance-write',
  }
  assert.deepEqual(registryProblems({ dirs: rust }), [])
  const misplaced = {
    ...FAMILY,
    implementations: [
      FAMILY.implementations[0],
      { ...FAMILY.implementations[1], dir: 'packages/ts/dirs-rs' },
    ],
  }
  assert.deepEqual(registryProblems({ dirs: misplaced }), [
    'dirs: packages/ts/dirs-rs is not under packages/rust/',
  ])
  assert.deepEqual(registryProblems({ Dirs: FAMILY }).slice(0, 1), [
    'Dirs: a family name is lower-case and dash-separated',
  ])
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
  assert.deepEqual(
    suiteProblems('s.json', { ...SUITE, family: 'other', reference: 'rust' }, 'dirs', 'ts'),
    ['s.json: family is other, not dirs', 's.json: reference is rust, not ts'],
  )
})

test('a case has a name, an input, and one of expect and error', () => {
  const with_ = (c: object) => ({ ...SUITE, sections: { s: { description: 'd', cases: [c] } } })
  assert.deepEqual(suiteProblems('f', with_({ name: 'a', input: {} }), 'dirs', 'ts'), [
    'f: s: a: give exactly one of expect and error',
  ])
  assert.deepEqual(
    suiteProblems(
      'f',
      with_({ name: 'a', input: {}, expect: {}, error: { kind: 'k' } }),
      'dirs',
      'ts',
    ),
    ['f: s: a: give exactly one of expect and error'],
  )
  assert.deepEqual(suiteProblems('f', with_({ input: {}, expect: {} }), 'dirs', 'ts'), [
    'f: s: case 0: no name',
  ])
  assert.deepEqual(suiteProblems('f', with_({ name: 'a', expect: {} }), 'dirs', 'ts'), [
    'f: s: a: no input',
  ])
  assert.deepEqual(
    suiteProblems('f', with_({ name: 'a', input: {}, expected: {} }), 'dirs', 'ts'),
    ['f: s: a: unknown keys expected', 'f: s: a: give exactly one of expect and error'],
  )
  assert.deepEqual(
    suiteProblems('f', with_({ name: 'a', input: {}, error: { kind: '' } }), 'dirs', 'ts'),
    ['f: s: a: error.kind is not a string'],
  )
})

test('a skip gives a reason, and platforms are known', () => {
  const with_ = (c: object) => ({
    ...SUITE,
    sections: { s: { description: 'd', cases: [{ name: 'a', input: {}, expect: {}, ...c }] } },
  })
  assert.deepEqual(suiteProblems('f', with_({ skip: { rust: ' ' } }), 'dirs', 'ts'), [
    'f: s: a: a skip for rust needs a reason',
  ])
  assert.deepEqual(suiteProblems('f', with_({ skip: { go: 'later' } }), 'dirs', 'ts'), [
    'f: s: a: skip names an unknown language go',
  ])
  assert.deepEqual(suiteProblems('f', with_({ platforms: ['linux'] }), 'dirs', 'ts'), [
    'f: s: a: platforms is a non-empty list of unix, windows',
  ])
  assert.deepEqual(suiteProblems('f', with_({ tolerance: 0 }), 'dirs', 'ts'), [
    'f: s: a: tolerance is a positive number',
  ])
})

test('two cases in a section may not share a name', () => {
  const cases = [
    { name: 'a', input: {}, expect: {} },
    { name: 'a', input: {}, expect: {} },
  ]
  assert.deepEqual(
    suiteProblems('f', { ...SUITE, sections: { s: { description: 'd', cases } } }, 'dirs', 'ts'),
    ['f: s: a: two cases have this name'],
  )
})

test('implementations share major.minor', () => {
  assert.equal(majorMinor('1.12.3'), '1.12')
  assert.deepEqual(versionProblems('dirs', { a: '0.4.1', b: '0.4.0' }), [])
  assert.deepEqual(versionProblems('dirs', { a: '0.5.0', b: '0.4.0' }), [
    'dirs: implementations do not share major.minor: a 0.5.0, b 0.4.0',
  ])
})

test('a pending changeset that levels a family counts as level', () => {
  const none = {}
  const now = { ts: '0.3.0', rs: '0.4.0' }
  const after = { ts: '0.4.0', rs: '0.4.0' }
  assert.deepEqual(versionProblems('f', now, after, none), [])
  assert.deepEqual(versionProblems('f', after, after, none), [])
  assert.deepEqual(versionProblems('f', now, now, none), [
    'f: implementations do not share major.minor: ts 0.3.0, rs 0.4.0',
  ])
  // a listed entry is stale once the versions agree, now or after the changesets
  assert.deepEqual(versionProblems('f', now, now, { f: 'x' }), [])
  assert.deepEqual(versionProblems('f', after, after, { f: 'x' }), [
    'f: listed in catchingUp but its versions agree; remove it',
  ])
  assert.deepEqual(versionProblems('f', now, after, { f: 'x' }), [
    'f: listed in catchingUp but the pending changesets level it (ts 0.4.0, rs 0.4.0); remove it',
  ])
})

test('pending changesets give each package its highest bump', () => {
  const a = `---\n'@x/a': patch\n"@x/b": minor\n---\n\nText: minor\n`
  const b = `---\n'@x/a': major\n---\n\nbody\n`
  const bumps = (...t: string[]) => [
    ...pendingBumps(t.map((x, i): [string, string] => [`c${i}.md`, x])),
  ]
  assert.deepEqual(bumps(a, b), [
    ['@x/a', 'major'],
    ['@x/b', 'minor'],
  ])
  assert.deepEqual(bumps('---\n"@x/a": patch\n---\n'), [['@x/a', 'patch']])
  assert.deepEqual(bumps('---\n---\n\nempty\n'), [])
  assert.deepEqual(bumps('---\n"@x/a": minor # why\n---\n'), [['@x/a', 'minor']])
  assert.throws(
    () => bumps('---\n"@x/a": minor, really\n---\n'),
    /c0\.md: cannot parse the frontmatter line/,
  )
  assert.deepEqual(bumps('---\n"@x/a": none\n---\n'), [['@x/a', 'none']])
  assert.deepEqual(bumps('---\r\n"@x/a": minor\r\n"@x/b": patch\r\n---\r\n\r\nbody\r\n'), [
    ['@x/a', 'minor'],
    ['@x/b', 'patch'],
  ])
  assert.throws(() => bumps('no frontmatter'), /c0\.md: no frontmatter/)
  assert.throws(() => bumps('--\n"@x/a": minor\n--\n'), /c0\.md: no frontmatter/)
  assert.throws(() => bumps('Notes\n\n---\n"@x/a": minor\n---\n'), /c0\.md: no frontmatter/)
  assert.equal(bumpVersion('0.3.2', 'none'), '0.3.2')
  assert.equal(bumpVersion('0.3.2', 'major'), '1.0.0')
  assert.equal(bumpVersion('1.3.2', 'major'), '2.0.0')
  assert.throws(
    () => bumpVersion('0.3.0-beta.1', 'minor'),
    /prerelease versions are not supported by this check/,
  )
  assert.equal(bumpVersion('0.3.2', 'minor'), '0.4.0')
  assert.equal(bumpVersion('0.3.2', 'patch'), '0.3.3')
})

test('a family level now must stay level after the pending changesets', () => {
  const now = { ts: '0.4.0', rs: '0.4.0' }
  const after = { ts: '0.5.0', rs: '0.4.0' }
  assert.deepEqual(versionProblems('f', now, after, {}), [
    'f: implementations share major.minor now, but the pending changesets would push them apart (ts 0.4.0 -> 0.5.0); level the bumps or add a catchingUp entry',
  ])
  assert.deepEqual(versionProblems('f', now, after, { f: 'x' }), [])
  assert.deepEqual(versionProblems('f', now, { ts: '0.4.1', rs: '0.4.0' }, {}), [])
})

test('config.json features the version check does not model are errors', () => {
  assert.deepEqual(configProblems({ fixed: [], linked: [], ignore: [] }, false), [])
  assert.deepEqual(configProblems({ fixed: [['a', 'b']], ignore: ['c'] }, true), [
    '.changeset/pre.json exists (pre mode); the version check does not support it',
    '.changeset/config.json sets fixed; the version check does not support it',
    '.changeset/config.json sets ignore; the version check does not support it',
  ])
  assert.deepEqual(configProblems({ linked: [['a', 'b']] }, false), [
    '.changeset/config.json sets linked; the version check does not support it',
  ])
  assert.deepEqual(configProblems({ ignore: 'x' }, false), [
    '.changeset/config.json sets ignore; the version check does not support it',
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
  assert.deepEqual(
    [...readers].map(([d, f]) => [d, [...f]]),
    [
      ['packages/ts/dirs', ['dirs']],
      ['packages/rust/dirs', ['dirs']],
    ],
  )
  assert.equal(readsAcross('packages/ts/x', ["'../../../rust/x/tests/fixtures/parity.json'"]), true)
  assert.equal(readsAcross('packages/rust/x', ['"../../ts/x/corpus/a.md"']), true)
  assert.equal(readsAcross('packages/ts/x', ["'./fixtures/a.json'"]), false)
  // A library root is matched literally, not as a regular expression.
  const roots = { ts: 'libs/t(s)', rust: 'crates.v1' }
  assert.equal(
    readsAcross('libs/t(s)/x', ["'../../crates.v1/x/tests/fixtures/a.json'"], roots),
    true,
  )
  assert.equal(
    readsAcross('libs/t(s)/x', ["'../../cratesXv1/x/tests/fixtures/a.json'"], roots),
    false,
  )
  assert.equal(readsAcross('crates.v1/x', ['"../../t(s)/x/corpus/a.md"'], roots), true)
  assert.equal(
    readsAcross('crates.v1/x', ['"../../crates[/x"'], { ts: 'a[', rust: 'crates.v1' }),
    false,
  )
})

test('a suite path is read under the suites directory name', () => {
  const files = new Map([['packages/ts/dirs', ["'../../../../suites/dirs/suite.json'"]]])
  assert.deepEqual(
    [...suiteReaders(files, 'suites')].map(([d, f]) => [d, [...f]]),
    [['packages/ts/dirs', ['dirs']]],
  )
  assert.deepEqual([...suiteReaders(files)], [])
})
