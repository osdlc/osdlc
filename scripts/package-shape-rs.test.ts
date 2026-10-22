// Tests for package-shape-rs.ts.
//
//   node --test scripts/package-shape-rs.test.ts
import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  changelogProblems,
  checkWorkspace,
  crateProblems,
  isUnpublished,
  layoutProblems,
  manifestProblems,
  parseToml,
  parseValue,
  publishedManifestProblems,
  readmeProblems,
  section,
  workspaceMembers,
} from './package-shape-rs.ts'

const GOOD_TOML = `
# a comment
[package]
name = "demo"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
description = "A demo # not a comment."
license.workspace = true
repository.workspace = true
readme = "README.md"
keywords = ["a", "b"]
categories = ["filesystem"]
include = [
  "src/**/*.rs", # trailing comment
  "README.md",
  "CHANGELOG.md",
  "LICENSE-MIT",
  "LICENSE-APACHE",
]

[dependencies]
thiserror = { workspace = true }

[lints]
workspace = true
`

const GOOD_README = '# demo\n\n## Install\n\n```sh\ncargo add demo\n```\n\n## License\n\nMIT or Apache.\n'
const GOOD_ENTRIES = {
  files: ['Cargo.toml', 'README.md', 'CHANGELOG.md', 'LICENSE-MIT', 'LICENSE-APACHE'],
  dirs: ['src', 'examples'],
}
const good = () => ({
  dirName: 'demo',
  manifest: parseToml(GOOD_TOML),
  entries: GOOD_ENTRIES,
  readme: GOOD_README,
  changelog: '# Changelog\n',
})

test('parseValue reads strings, booleans, numbers, arrays and inline tables', () => {
  assert.equal(parseValue('"a b"'), 'a b')
  assert.equal(parseValue('true'), true)
  assert.equal(parseValue('3'), 3)
  assert.deepEqual(parseValue('["a", "b,c"]'), ['a', 'b,c'])
  assert.deepEqual(parseValue('{ workspace = true }'), { workspace: true })
  assert.deepEqual(parseValue('{ version = "1", features = ["x"] }'), { version: '1', features: ['x'] })
})

test('parseToml reads tables, dotted keys, multi-line arrays and strips comments', () => {
  const t = parseToml(GOOD_TOML)
  assert.equal(t.package.name, 'demo')
  assert.deepEqual(t.package['rust-version'], { workspace: true })
  assert.equal(t.package.description, 'A demo # not a comment.')
  assert.equal(t.package.include.length, 5)
  assert.deepEqual(t.dependencies.thiserror, { workspace: true })
  assert.deepEqual(t.lints, { workspace: true })
})

test('parseToml reads [[array]] tables', () => {
  const t = parseToml('[[test]]\nname = "a"\n\n[[test]]\nname = "b"\n')
  assert.deepEqual(t.test, [{ name: 'a' }, { name: 'b' }])
})

test('workspaceMembers reads the members list, however it is wrapped', () => {
  assert.deepEqual(workspaceMembers('[workspace]\nmembers = ["a", "b"]\n'), ['a', 'b'])
  assert.deepEqual(workspaceMembers('[workspace]\nmembers = [\n  "a",\n  "b",\n]\n'), ['a', 'b'])
  assert.deepEqual(workspaceMembers('[package]\nname = "x"\n'), [])
})

test('a crate in the shape has no problems', () => {
  assert.deepEqual(crateProblems(good()), [])
})

test('every workspace field must come from the workspace', () => {
  for (const key of ['edition', 'rust-version', 'license', 'repository']) {
    const manifest = parseToml(GOOD_TOML)
    manifest.package[key] = key === 'edition' ? '2024' : 'x'
    const problems = manifestProblems('demo', manifest)
    assert.equal(problems.length, 1, key)
    assert.match(problems[0]!, new RegExp(`package.${key}`))
  }
})

test('the name must be the directory name and the description must not be empty', () => {
  const manifest = parseToml(GOOD_TOML)
  manifest.package.name = 'other'
  manifest.package.description = '  '
  assert.equal(manifestProblems('demo', manifest).length, 2)
})

test('[lints] must be workspace = true', () => {
  const manifest = parseToml(GOOD_TOML)
  delete manifest.lints
  assert.match(manifestProblems('demo', manifest).join('\n'), /\[lints\]/)
})

test('a published crate needs readme, keywords, categories and include', () => {
  const manifest = parseToml(GOOD_TOML)
  manifest.package.readme = 'README.txt'
  manifest.package.keywords = []
  delete manifest.package.categories
  assert.equal(publishedManifestProblems(manifest).length, 3)
})

test('keywords are capped at five', () => {
  const manifest = parseToml(GOOD_TOML)
  manifest.package.keywords = ['a', 'b', 'c', 'd', 'e', 'f']
  assert.match(publishedManifestProblems(manifest).join('\n'), /allows 5/)
})

test('include must ship src, the README, the CHANGELOG and both licences, and may ship more', () => {
  const manifest = parseToml(GOOD_TOML)
  manifest.package.include = ['tests/**/*.rs', 'README.md']
  const problems = publishedManifestProblems(manifest).join('\n')
  assert.match(problems, /src\//)
  assert.match(problems, /CHANGELOG\.md/)
  assert.match(problems, /LICENSE-MIT/)
  assert.match(problems, /LICENSE-APACHE/)
  manifest.package.include = [...parseToml(GOOD_TOML).package.include, 'tests/**/*.rs']
  assert.deepEqual(publishedManifestProblems(manifest), [])
  delete manifest.package.include
  assert.match(publishedManifestProblems(manifest).join('\n'), /include is missing/)
})

test('a published crate keeps its files and directories', () => {
  assert.deepEqual(layoutProblems(GOOD_ENTRIES, true), [])
  const problems = layoutProblems({ files: ['Cargo.toml'], dirs: [] }, true)
  assert.equal(problems.length, 6)
})

test('README.md needs its title, Install with cargo add, and License naming both licences', () => {
  assert.deepEqual(readmeProblems('demo', GOOD_README), [])
  assert.equal(readmeProblems('demo', '# other\n').length, 3)
  assert.match(readmeProblems('demo', '# demo\n\n## Install\n\nnothing\n\n## License\n\nMIT\n').join('\n'), /cargo add demo/)
  assert.match(readmeProblems('demo', '# demo\n\n## Install\n\ncargo add demo\n\n## License\n\nMIT\n').join('\n'), /both MIT and Apache/)
})

test('a heading inside a fence is not a section', () => {
  assert.equal(section('```\n## Install\n```\n', 'Install'), null)
})

test('CHANGELOG.md starts "# Changelog"', () => {
  assert.deepEqual(changelogProblems('# Changelog\n'), [])
  assert.equal(changelogProblems('# demo\n').length, 1)
})

test('a crate with publish = false keeps only the code-health subset', () => {
  const manifest = parseToml(`
[package]
name = "demo"
edition.workspace = true
rust-version.workspace = true
description = "wasm wrapper"
license.workspace = true
repository.workspace = true
publish = false

[lints]
workspace = true
`)
  assert.equal(isUnpublished(manifest), true)
  const entries = { files: ['Cargo.toml', 'README.md', 'LICENSE-MIT', 'LICENSE-APACHE'], dirs: ['src'] }
  assert.deepEqual(crateProblems({ dirName: 'demo', manifest, entries, readme: null, changelog: null }), [])
  // It still needs the workspace fields, the licence files and src/.
  manifest.package.edition = '2021'
  const bad = crateProblems({ dirName: 'demo', manifest, entries: { files: [], dirs: [] }, readme: null, changelog: null })
  assert.equal(bad.length, 4)
})

test('a multi-line string is a clear error naming the line, not a crash', () => {
  assert.throws(
    () => parseToml('[package]\nname = "demo"\ndescription = """\nA long\n"""\n'),
    /line 3: multi-line strings are not supported/,
  )
  assert.throws(() => parseToml("description = '''x'''\n"), /multi-line strings are not supported/)
  assert.throws(
    () => parseToml('keywords = [\n  "a",\n  """b""",\n]\n'),
    /line 3: multi-line strings are not supported/,
  )
})

test('triple quotes inside a one-line string are ordinary text', () => {
  assert.equal(parseToml(`description = "it'''s"\n`).description, "it'''s")
  assert.equal(parseToml(`a = 'say """'\n`).a, 'say """')
})

test('checkWorkspace reports a multi-line string as a problem for its crate', () => {
  const root = mkdtempSync(join(tmpdir(), 'package-shape-rs-'))
  try {
    const rust = join(root, 'packages', 'rust')
    mkdirSync(join(rust, 'demo'), { recursive: true })
    writeFileSync(join(rust, 'Cargo.toml'), '[workspace]\nmembers = ["demo"]\n')
    writeFileSync(join(rust, 'demo', 'Cargo.toml'), '[package]\nname = "demo"\ndescription = """\nx\n"""\n')
    const [result] = checkWorkspace(root) as [{ member: string; problems: string[] }]
    assert.equal(result.member, 'demo')
    assert.equal(result.problems.length, 1)
    assert.match(result.problems[0]!, /packages\/rust\/demo\/Cargo\.toml: line 3: multi-line strings are not supported/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('every crate in this repository is in the shape', () => {
  const failing = checkWorkspace(process.cwd()).filter((r) => r.problems.length > 0)
  assert.deepEqual(failing, [])
})
