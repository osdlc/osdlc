import { strict as assert } from 'node:assert'

import { test } from 'vitest'

import { FAMILY, repo, type Put } from './_fixture.ts'

test('a conforming repository has no problems', () => {
  assert.deepEqual(repo(), [])
})

test('a changeset on the TypeScript package levels a family that differs now', () => {
  const behind = (put: Put) =>
    put('packages/rust/dirs/Cargo.toml', '[package]\nname = "dirs"\nversion = "0.3.0"\n')
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
  const behind = (put: Put) =>
    put('packages/rust/dirs/Cargo.toml', '[package]\nname = "dirs"\nversion = "0.3.0"\n')
  assert.deepEqual(
    repo((put) => put('.changeset/bad.md', "---\n'@x/dirs': sideways\n---\n")),
    ['.changeset/bad.md: cannot parse the frontmatter line "\'@x/dirs\': sideways"'],
  )
  assert.deepEqual(
    repo((put) => put('.changeset/pre.json', '{}')),
    ['.changeset/pre.json exists (pre mode); the version check does not support it'],
  )
  assert.deepEqual(
    repo((put) => {
      put(
        'packages/ts/dirs/package.json',
        JSON.stringify({ name: '@x/dirs', version: '0.2.0-beta.1' }),
      )
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
    [
      'dirs: implementations do not share major.minor: packages/ts/dirs 0.2.3, packages/rust/dirs 0.3.0',
    ],
  )
  // a none bump is accepted and releases nothing; README.md is not a changeset; a Rust crate is not versioned by changesets
  assert.equal(
    repo((put) => {
      behind(put)
      put('.changeset/n.md', "---\n'@x/dirs': none\n---\n")
    }).length,
    1,
  )
  assert.deepEqual(
    repo((put) => put('.changeset/README.md', '# Changesets\n\nno frontmatter here\n')),
    [],
  )
  assert.equal(
    repo((put) => {
      put('packages/ts/dirs/package.json', JSON.stringify({ name: '@x/dirs', version: '0.3.0' }))
      put('.changeset/crate.md', "---\n'dirs': minor\n---\n")
    }).length,
    1,
  )
  assert.match(
    repo((put) => put('.changeset/x.md', 'no frontmatter\n'))[0]!,
    /^\.changeset\/x\.md: no frontmatter/,
  )
  // a patch does not level a family that differs by minor; major on 0.x goes to 1.0.0
  const named = (bump: string) => (put: Put) => {
    behind(put)
    put('.changeset/dirs.md', `---\n'@x/dirs': ${bump}\n---\n`)
  }
  assert.equal(repo(named('patch')).length, 1)
  assert.match(
    repo(named('patch'))[0]!,
    /pending changesets do not level them \(packages\/ts\/dirs 0\.2\.3 -> 0\.2\.4\)/,
  )
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
    repo((put) =>
      put('packages/rust/dirs/Cargo.toml', '[package]\nname = "dirs"\nversion = "0.3.0"\n'),
    ),
    [
      'dirs: implementations do not share major.minor: packages/ts/dirs 0.2.3, packages/rust/dirs 0.3.0',
    ],
  )
  assert.deepEqual(
    repo((put) =>
      put('packages/ts/stray/tests/x.test.ts', "'../../../rust/stray/tests/fixtures/parity.json'"),
    ),
    [
      "packages/ts/stray: reads the other language's fixtures; move them to a suite in packages/conformance/",
    ],
  )
})

test('a family with one implementation needs a SPEC.md', () => {
  const one = (put: Put) => {
    put(
      'packages/conformance/families.json',
      JSON.stringify({ dirs: { ...FAMILY, implementations: FAMILY.implementations.slice(0, 1) } }),
    )
    put('packages/rust/dirs/tests/c.rs', '// reads nothing')
  }
  assert.deepEqual(repo(one), [
    'dirs: a family with one implementation states its format in packages/conformance/dirs/SPEC.md',
  ])
  assert.deepEqual(
    repo((put) => {
      one(put)
      put('packages/conformance/dirs/SPEC.md', '# dirs\n')
    }),
    [],
  )
})

test('config.json moves the library roots and lists the exemptions', () => {
  const moved = {
    ...FAMILY,
    implementations: FAMILY.implementations.map((i) => ({
      ...i,
      dir: i.dir.replace('packages/', 'libs/'),
    })),
  }
  assert.deepEqual(
    repo((put) => {
      put('packages/conformance/families.json', JSON.stringify({ dirs: moved }))
      put(
        'packages/conformance/config.json',
        JSON.stringify({ libraries: { ts: 'libs/ts', rust: 'libs/rust' } }),
      )
      put('libs/ts/dirs/package.json', JSON.stringify({ name: '@x/dirs', version: '0.2.3' }))
      put(
        'libs/ts/dirs/tests/c.test.ts',
        "readSuite('../../../packages/conformance/dirs/suite.json')",
      )
      put('libs/rust/dirs/Cargo.toml', '[package]\nname = "dirs"\nversion = "0.2.0"\n')
      put(
        'libs/rust/dirs/tests/c.rs',
        'include_str!("../../../packages/conformance/dirs/suite.json")',
      )
    }),
    [],
  )
  const stray = (put: Put) =>
    put('packages/ts/stray/tests/x.test.ts', "'../../../rust/stray/tests/fixtures/parity.json'")
  assert.deepEqual(
    repo((put) => {
      stray(put)
      put('packages/conformance/config.json', JSON.stringify({ unmigrated: ['packages/ts/stray'] }))
    }),
    [],
  )
  assert.deepEqual(
    repo((put) => {
      stray(put)
      put(
        'packages/conformance/config.json',
        JSON.stringify({ skipScan: { 'packages/ts/stray': 'its tests hold paths as data' } }),
      )
    }),
    [],
  )
  assert.deepEqual(
    repo((put) =>
      put('packages/conformance/config.json', JSON.stringify({ unmigrated: ['packages/ts/dirs'] })),
    ),
    ["packages/ts/dirs: listed in unmigrated but reads no other language's fixtures; remove it"],
  )
  assert.deepEqual(
    repo((put) =>
      put('packages/conformance/config.json', JSON.stringify({ catchingUp: { other: 'later' } })),
    ),
    ['config.json: catchingUp names other, which families.json does not list'],
  )
  assert.deepEqual(
    repo((put) =>
      put(
        'packages/conformance/config.json',
        JSON.stringify({ skipScan: { 'packages/ts/gone': 'x' } }),
      ),
    ),
    ['config.json: skipScan names packages/ts/gone, which is not a library'],
  )
  assert.deepEqual(
    repo((put) =>
      put('packages/conformance/config.json', JSON.stringify({ unmigrated: ['packages/ts/gone'] })),
    ),
    ['config.json: unmigrated names packages/ts/gone, which is not a library'],
  )
})

test('a config.json it cannot read stops the check', () => {
  assert.deepEqual(
    repo((put) => put('packages/conformance/config.json', JSON.stringify({ catchingup: {} }))),
    ['config.json: unknown keys catchingup'],
  )
  assert.deepEqual(
    repo((put) => put('packages/conformance/config.json', JSON.stringify({ skipScan: { a: '' } }))),
    ['config.json: skipScan maps a library directory to a reason'],
  )
  assert.deepEqual(
    repo((put) =>
      put('packages/conformance/config.json', JSON.stringify({ libraries: { go: 'x' } })),
    ),
    ['config.json: libraries maps ts and rust to a directory'],
  )
  for (const libraries of [{ ts: 'packages' }, { rust: 'packages/ts/' }]) {
    assert.deepEqual(
      repo((put) => put('packages/conformance/config.json', JSON.stringify({ libraries }))),
      ['config.json: libraries.ts and libraries.rust are separate directories'],
    )
  }
  assert.deepEqual(
    repo((put) =>
      put(
        'packages/conformance/config.json',
        JSON.stringify({ libraries: { ts: 'ts/libs', rust: 'rust/libs' } }),
      ),
    ),
    ['config.json: libraries.ts and libraries.rust end in different folder names'],
  )
  assert.match(repo((put) => put('packages/conformance/config.json', '{'))[0]!, /^config\.json: /)
})
