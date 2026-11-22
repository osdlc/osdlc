// Runs the built package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name to it), so dist/ is compiled but
// never run anywhere else. A broken emit passes every other check and fails on
// the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. `package-checks ts` copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.
//
// Also runs the installed binary: `--help`, `--version`, and `query` over a
// one-note vault must exit 0.

import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { evaluate, parseBase, parseExpression } from '@osdlc/markdown-vault-query'

// The engine parses a base and evaluates an expression with no vault.
const base = parseBase('views:\n  - type: table\n    name: All\n    order: [file.name]\n')
assert.equal(base.views[0].name, 'All')
assert.equal(evaluate(parseExpression('1 + 2 * 3'), {}), 7)

// The binary sits beside dist/ in the package, installed or not.
const dist = dirname(fileURLToPath(import.meta.resolve('@osdlc/markdown-vault-query')))
const bin = join(dist, '..', 'bin', 'markdown-vault-query.js')
const run = (...args) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' })

const help = run('--help')
assert.equal(help.status, 0, `markdown-vault-query --help exited ${help.status}: ${help.stderr}`)
assert.match(help.stdout, /markdown-vault-query/)

// `--version` prints the version stamped from package.json.
const pkg = JSON.parse(readFileSync(join(dist, '..', 'package.json'), 'utf8'))
const version = run('--version')
assert.equal(version.status, 0, `--version exited ${version.status}: ${version.stderr}`)
assert.equal(version.stdout, `markdown-vault-query ${pkg.version}\n`)

// `query` scans a vault and prints the view as a table.
const root = realpathSync(mkdtempSync(join(tmpdir(), 'markdown-vault-query-smoke-')))
try {
  mkdirSync(join(root, 'notes'))
  writeFileSync(join(root, 'notes', 'alpha.md'), '---\nstatus: open\n---\n# Alpha\n')
  writeFileSync(join(root, 'notes', 'beta.md'), '---\nstatus: done\n---\n# Beta\n')
  const file = join(root, 'open.base')
  writeFileSync(
    file,
    'filters: status == "open"\nviews:\n  - type: table\n    name: Open\n    order: [file.name, status]\n',
  )
  const query = run('query', file, '--vault', root)
  assert.equal(query.status, 0, `query exited ${query.status}: ${query.stderr}`)
  assert.match(query.stdout, /alpha\.md/)
  assert.doesNotMatch(query.stdout, /beta\.md/)
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log('markdown-vault-query smoke: OK')
