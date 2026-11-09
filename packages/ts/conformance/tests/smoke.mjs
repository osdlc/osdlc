// Runs the built package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name to it), so dist/ is compiled but
// never run anywhere else. A broken emit passes every other check and fails on
// the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. The package check copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { bumpVersion, checkRepo, main, registryProblems } from '@osdlc/conformance'

assert.equal(bumpVersion('0.3.2', 'minor'), '0.4.0')
assert.deepEqual(registryProblems({ Bad: {} }).slice(0, 1), [
  'Bad: a family name is lower-case and dash-separated',
])

const root = mkdtempSync(join(tmpdir(), 'conformance-smoke-'))
const put = (file, text) => {
  mkdirSync(dirname(join(root, file)), { recursive: true })
  writeFileSync(join(root, file), text)
}
try {
  put(
    'packages/conformance/families.json',
    JSON.stringify({
      dirs: {
        reference: 'rust',
        generator: 'cargo run -p dirs --example conformance-write',
        implementations: [{ language: 'rust', dir: 'packages/rust/dirs', name: 'dirs' }],
      },
    }),
  )
  put('packages/conformance/dirs/README.md', '# dirs\n')
  put('packages/conformance/dirs/SPEC.md', '# dirs\n')
  put(
    'packages/conformance/dirs/suite.json',
    JSON.stringify({
      family: 'dirs',
      reference: 'rust',
      referenceVersion: '0.1.0',
      sections: { s: { description: 'd', cases: [{ name: 'a', input: {}, expect: {} }] } },
    }),
  )
  // smol-toml reads the crate's version.
  put('packages/rust/dirs/Cargo.toml', '[package]\nname = "dirs"\nversion = "0.1.0"\n')
  put('packages/rust/dirs/tests/c.rs', 'include_str!("../../../conformance/dirs/suite.json")')
  assert.deepEqual(checkRepo(root), [])
  const lines = []
  assert.equal(
    main(['check', '--root', root], { out: (l) => lines.push(l), err: (l) => lines.push(l) }),
    0,
  )
  assert.deepEqual(lines, ['conformance suites pass'])
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log('smoke: @osdlc/conformance ok')
