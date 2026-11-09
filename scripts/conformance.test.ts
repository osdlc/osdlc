// Tests for conformance.ts.
//
//   node --test scripts/conformance.test.ts
import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  bumpVersion,
  checkRepo,
  generatorBuildFilters,
  majorMinor,
  configProblems,
  pendingBumps,
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
  assert.deepEqual(registryProblems({ dirs: { ...FAMILY, implementations: FAMILY.implementations.slice(0, 1) } }), [])
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

test('an implementation that was never released is not compared', () => {
  assert.deepEqual(versionProblems('dirs', { a: '0.0.0', b: '0.1.0' }), [])
  assert.deepEqual(versionProblems('dirs', { a: '0.0.0', b: '0.1.0', c: '0.2.0' }), [
    'dirs: implementations do not share major.minor: a 0.0.0, b 0.1.0, c 0.2.0',
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
  assert.deepEqual(versionProblems('f', after, after, { f: 'x' }), ['f: listed in CATCHING_UP but its versions agree; remove it'])
  assert.deepEqual(versionProblems('f', now, after, { f: 'x' }), [
    'f: listed in CATCHING_UP but the pending changesets level it (ts 0.4.0, rs 0.4.0); remove it',
  ])
})

test('pending changesets give each package its highest bump', () => {
  const a = `---\n'@x/a': patch\n"@x/b": minor\n---\n\nText: minor\n`
  const b = `---\n'@x/a': major\n---\n\nbody\n`
  const bumps = (...t: string[]) => [...pendingBumps(t.map((x, i): [string, string] => [`c${i}.md`, x]))]
  assert.deepEqual(bumps(a, b), [['@x/a', 'major'], ['@x/b', 'minor']])
  assert.deepEqual(bumps('---\n"@x/a": patch\n---\n'), [['@x/a', 'patch']])
  assert.deepEqual(bumps('---\n---\n\nempty\n'), [])
  assert.deepEqual(bumps('---\n"@x/a": minor # why\n---\n'), [['@x/a', 'minor']])
  assert.throws(() => bumps('---\n"@x/a": minor, really\n---\n'), /c0\.md: cannot parse the frontmatter line/)
  assert.deepEqual(bumps('---\n"@x/a": none\n---\n'), [['@x/a', 'none']])
  assert.deepEqual(bumps('---\r\n"@x/a": minor\r\n"@x/b": patch\r\n---\r\n\r\nbody\r\n'), [['@x/a', 'minor'], ['@x/b', 'patch']])
  assert.throws(() => bumps('no frontmatter'), /c0\.md: no frontmatter/)
  assert.throws(() => bumps('--\n"@x/a": minor\n--\n'), /c0\.md: no frontmatter/)
  assert.throws(() => bumps('Notes\n\n---\n"@x/a": minor\n---\n'), /c0\.md: no frontmatter/)
  assert.equal(bumpVersion('0.3.2', 'none'), '0.3.2')
  assert.equal(bumpVersion('0.3.2', 'major'), '1.0.0')
  assert.equal(bumpVersion('1.3.2', 'major'), '2.0.0')
  assert.throws(() => bumpVersion('0.3.0-beta.1', 'minor'), /prerelease versions are not supported by this check/)
  assert.equal(bumpVersion('0.3.2', 'minor'), '0.4.0')
  assert.equal(bumpVersion('0.3.2', 'patch'), '0.3.3')
})

test('a family level now must stay level after the pending changesets', () => {
  const now = { ts: '0.4.0', rs: '0.4.0' }
  const after = { ts: '0.5.0', rs: '0.4.0' }
  assert.deepEqual(versionProblems('f', now, after, {}), [
    'f: implementations share major.minor now, but the pending changesets would push them apart (ts 0.4.0 -> 0.5.0); level the bumps or add a CATCHING_UP entry',
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
  assert.deepEqual([...readers].map(([d, f]) => [d, [...f]]), [
    ['packages/ts/dirs', ['dirs']],
    ['packages/rust/dirs', ['dirs']],
  ])
  assert.equal(readsAcross('packages/ts/x', ["'../../../rust/x/tests/fixtures/parity.json'"]), true)
  assert.equal(readsAcross('packages/rust/x', ['"../../ts/x/corpus/a.md"']), true)
  assert.equal(readsAcross('packages/ts/x', ["'./fixtures/a.json'"]), false)
})

type Put = (file: string, text: string) => void

/** A repository on disk with one family, `edit` changing files before the check. */
function repo(edit: (put: Put) => void = () => {}): string[] {
  return inRepo(edit, checkRepo)
}

/** `run` on that repository, after `edit`; the repository is removed afterwards. */
function inRepo<T>(edit: (put: Put) => void, run: (root: string) => T): T {
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
    return run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('a conforming repository has no problems', () => {
  assert.deepEqual(repo(), [])
})

test('a changeset on the TypeScript package levels a family that differs now', () => {
  const behind = (put: Put) => put('packages/rust/dirs/Cargo.toml', '[package]\nname = "dirs"\nversion = "0.3.0"\n')
  assert.equal(repo(behind).length, 1)
  assert.deepEqual(
    repo((put) => {
      behind(put)
      put('.changeset/dirs.md', "---\n'@x/dirs': minor\n---\n\nNotes.\n")
    }),
    [],
  )
})

test('a repository check rejects what it cannot model', () => {
  const behind = (put: Put) => put('packages/rust/dirs/Cargo.toml', '[package]\nname = "dirs"\nversion = "0.3.0"\n')
  assert.deepEqual(repo((put) => put('.changeset/bad.md', "---\n'@x/dirs': sideways\n---\n")), [
    '.changeset/bad.md: cannot parse the frontmatter line "\'@x/dirs\': sideways"',
  ])
  assert.deepEqual(repo((put) => put('.changeset/pre.json', '{}')), [
    '.changeset/pre.json exists (pre mode); the version check does not support it',
  ])
  assert.deepEqual(
    repo((put) => {
      put('packages/ts/dirs/package.json', JSON.stringify({ name: '@x/dirs', version: '0.2.0-beta.1' }))
      put('.changeset/dirs.md', "---\n'@x/dirs': minor\n---\n")
    }),
    ['dirs: 0.2.0-beta.1: prerelease versions are not supported by this check'],
  )
  // a changeset naming an unrelated package changes nothing
  assert.deepEqual(
    repo((put) => {
      behind(put)
      put('.changeset/other.md', "---\n'@x/other': minor\n---\n")
    }),
    ['dirs: implementations do not share major.minor: packages/ts/dirs 0.2.3, packages/rust/dirs 0.3.0'],
  )
  // a none bump is accepted and releases nothing; README.md is not a changeset; a Rust crate is not versioned by changesets
  assert.equal(repo((put) => { behind(put); put('.changeset/n.md', "---\n'@x/dirs': none\n---\n") }).length, 1)
  assert.deepEqual(repo((put) => put('.changeset/README.md', '# Changesets\n\nno frontmatter here\n')), [])
  assert.equal(
    repo((put) => {
      put('packages/ts/dirs/package.json', JSON.stringify({ name: '@x/dirs', version: '0.3.0' }))
      put('.changeset/crate.md', "---\n'dirs': minor\n---\n")
    }).length,
    1,
  )
  assert.match(repo((put) => put('.changeset/x.md', 'no frontmatter\n'))[0]!, /^\.changeset\/x\.md: no frontmatter/)
  // a patch does not level a family that differs by minor; major on 0.x goes to 1.0.0
  const named = (bump: string) => (put: Put) => {
    behind(put)
    put('.changeset/dirs.md', `---\n'@x/dirs': ${bump}\n---\n`)
  }
  assert.equal(repo(named('patch')).length, 1)
  assert.match(repo(named('patch'))[0]!, /pending changesets do not level them \(packages\/ts\/dirs 0\.2\.3 -> 0\.2\.4\)/)
  assert.match(repo(named('major'))[0]!, /0\.2\.3 -> 1\.0\.0/)
  // level now, then unlevelled by a changeset
  assert.match(
    repo((put) => {
      put('packages/ts/dirs/package.json', JSON.stringify({ name: '@x/dirs', version: '0.2.3' }))
      put('.changeset/dirs.md', "---\n'@x/dirs': minor # why\n---\n")
    })[0]!,
    /share major\.minor now, but the pending changesets would push them apart \(packages\/ts\/dirs 0\.2\.3 -> 0\.3\.0\)/,
  )
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

test('a family with one implementation needs a SPEC.md', () => {
  const one = (put: Put) => {
    put('packages/conformance/families.json', JSON.stringify({ dirs: { ...FAMILY, implementations: FAMILY.implementations.slice(0, 1) } }))
    put('packages/rust/dirs/tests/c.rs', '// reads nothing')
  }
  assert.deepEqual(repo(one), ['dirs: a family with one implementation states its format in packages/conformance/dirs/SPEC.md'])
  assert.deepEqual(
    repo((put) => {
      one(put)
      put('packages/conformance/dirs/SPEC.md', '# dirs\n')
    }),
    [],
  )
})

/**
 * Run the script with `args` on the conforming repository, its family
 * referenced by the crate. A `cargo` stand-in first on PATH runs a generator
 * that stamps `referenceVersion` 9.9.9, as a version bump makes it. `edit`
 * changes files first.
 */
function runStamping(args: string[], edit: (put: Put) => void = () => {}) {
  return inRepo(
    (put) => {
      // Run from packages/rust, as a Rust generator is.
      put(
        'bin/cargo',
        `#!/bin/sh\nexec '${process.execPath}' -e "const fs = require('node:fs'); const p = '../conformance/dirs/suite.json'; ` +
          `fs.writeFileSync(p, JSON.stringify({ ...JSON.parse(fs.readFileSync(p, 'utf8')), referenceVersion: '9.9.9' }))"\n`,
      )
      const family = { ...FAMILY, reference: 'rust', generator: 'cargo run -p dirs --example conformance-write' }
      put('packages/conformance/families.json', JSON.stringify({ dirs: family }))
      put('packages/conformance/dirs/suite.json', JSON.stringify({ ...SUITE, reference: 'rust' }))
      edit(put)
    },
    (root) => {
      chmodSync(join(root, 'bin/cargo'), 0o755)
      const script = fileURLToPath(new URL('./conformance.ts', import.meta.url))
      const env = { ...process.env, PATH: `${join(root, 'bin')}:${process.env['PATH'] ?? ''}` }
      const run = spawnSync(process.execPath, [script, ...args], { cwd: root, env, encoding: 'utf8' })
      const suite = JSON.parse(readFileSync(join(root, 'packages/conformance/dirs/suite.json'), 'utf8')) as {
        referenceVersion: string
      }
      return { status: run.status, out: run.stdout + run.stderr, version: suite.referenceVersion }
    },
  )
}

// The cargo stand-in is a shell script.
const UNIX = { skip: process.platform === 'win32' }

test('--regenerate fails on a suite its generator changed, naming the generator', UNIX, () => {
  const res = runStamping(['--regenerate'])
  assert.equal(res.status, 1)
  assert.match(
    res.out,
    /packages\/conformance\/dirs\/suite\.json: its generator changed it; run `cargo run -p dirs --example conformance-write` and commit the result/,
  )
})

test('--regenerate checks first, and runs no generator when a check fails', UNIX, () => {
  const res = runStamping(['--regenerate'], (put) => put('packages/rust/dirs/tests/c.rs', '// reads nothing'))
  assert.equal(res.status, 1)
  assert.equal(res.version, '0.2.0')
  assert.match(res.out, /no test under packages\/rust\/dirs\/tests/)
})

test('--write keeps what the generator wrote and exits 0, even when a check fails', UNIX, () => {
  const res = runStamping(['--write'], (put) => put('packages/rust/dirs/tests/c.rs', '// reads nothing'))
  assert.equal(res.status, 0, res.out)
  assert.equal(res.version, '9.9.9')
  assert.match(res.out, /rewrote packages\/conformance\/dirs\/suite\.json/)
})
