// Runs the built package under Node: imports each entry by name, as a consumer
// does (through `exports`, into dist/), and runs the `code-stats` bin once.
// The unit tests run the TypeScript source (vitest.config.ts aliases the
// package name to it), so a broken emit passes every other check and fails on
// the consumer's machine.
//
// `pnpm run smoke` runs it here, where the name resolves to this package's own
// dist/. `package-checks ts` copies it into a clean project that installed the
// tarball, so it must not import other repo files. It is not a test-runner
// suite and is not in `files`.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkg = await import('@osdlc/code-stats')
const scan = await import('@osdlc/code-stats/scan')
const treeSitter = await import('@osdlc/code-stats/tree-sitter')

assert.equal(typeof pkg.countDirectory, 'function')
assert.equal(typeof treeSitter.createTreeSitterScanners, 'function')
const scanned = scan.createScannerRegistry().scan('// a\nexport const a = 1\n', 'a.ts')
assert.deepEqual(scanned.kinds, ['comment', 'logic'])

const dir = mkdtempSync(join(tmpdir(), 'code-stats-smoke-'))
try {
  writeFileSync(join(dir, 'a.ts'), '// a\nexport const a = 1\n')
  const report = pkg.countDirectory({ dir })
  assert.equal(report.files, 1)

  // The binary sits beside dist/ in the package, installed or not.
  const dist = dirname(fileURLToPath(import.meta.resolve('@osdlc/code-stats')))
  const bin = join(dist, '..', 'bin', 'code-stats.js')
  const run = spawnSync(process.execPath, [bin, 'count', '--json'], {
    cwd: dir,
    encoding: 'utf8',
  })
  assert.equal(run.status, 0, run.stderr)
  const doc = JSON.parse(run.stdout)
  assert.equal(doc.kind, 'count')
  assert.equal(doc.files, 1)
  assert.equal(doc.kinds.logic, 1)

  // `--version` prints the version stamped from package.json.
  const manifest = JSON.parse(readFileSync(join(dist, '..', 'package.json'), 'utf8'))
  const version = spawnSync(process.execPath, [bin, '--version'], { encoding: 'utf8' })
  assert.equal(version.status, 0, version.stderr)
  assert.equal(version.stdout, `code-stats ${manifest.version}\n`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

process.stdout.write(`code-stats smoke: ok under node ${process.version}\n`)
