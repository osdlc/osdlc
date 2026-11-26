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
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkg = await import('@osdlc/code-stats')
const scan = await import('@osdlc/code-stats/scan')
const prep = await import('@osdlc/code-stats/prep')
const analysis = await import('@osdlc/code-stats/analysis')
const treeSitter = await import('@osdlc/code-stats/tree-sitter')

assert.equal(typeof pkg.countDirectory, 'function')
assert.equal(typeof treeSitter.createTreeSitterScanners, 'function')
assert.equal(typeof prep.runPrep, 'function')
assert.equal(typeof analysis.diffApi, 'function')
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

// `prep` over a two-commit repository prints a manifest the exported schema accepts:
// the changed file is kept, in one group rooted at its package.
const root = realpathSync(mkdtempSync(join(tmpdir(), 'code-stats-prep-smoke-')))
try {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  }
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: root, env, encoding: 'utf8' })
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  }
  git('init', '-q', '-b', 'main')
  mkdirSync(join(root, 'pkg'))
  writeFileSync(join(root, 'pkg', 'package.json'), '{}\n')
  writeFileSync(join(root, 'pkg', 'a.ts'), 'export const a = 1\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'initial')
  writeFileSync(join(root, 'pkg', 'a.ts'), 'export const a = 2\nexport const b = 3\n')
  git('commit', '-q', '-a', '-m', 'change')

  const dist = dirname(fileURLToPath(import.meta.resolve('@osdlc/code-stats')))
  const bin = join(dist, '..', 'bin', 'code-stats.js')
  const run = spawnSync(process.execPath, [bin, 'prep', '--base', 'HEAD~1'], {
    cwd: root,
    env,
    encoding: 'utf8',
  })
  assert.equal(run.status, 0, `code-stats prep exited ${run.status}: ${run.stderr}`)
  const manifest = prep.prepManifestSchema.parse(JSON.parse(run.stdout))
  assert.deepEqual(
    manifest.files.kept.map((f) => f.path),
    ['pkg/a.ts'],
  )
  assert.deepEqual(manifest.groups[0].roots, ['pkg'])
  assert.deepEqual(manifest.thresholds, prep.DEFAULT_THRESHOLDS)
} finally {
  rmSync(root, { recursive: true, force: true })
}

process.stdout.write(`code-stats smoke: ok under node ${process.version}\n`)
