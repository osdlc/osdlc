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
// Also runs the installed binary: `diffkit --help`, `--version` and
// `prep --base` over a two-commit repository must exit 0.

import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEFAULT_THRESHOLDS, prepManifestSchema } from '@osdlc/diffkit'

// The binary sits beside dist/ in the package, installed or not.
const dist = dirname(fileURLToPath(import.meta.resolve('@osdlc/diffkit')))
const bin = join(dist, '..', 'bin', 'diffkit.js')

const root = realpathSync(mkdtempSync(join(tmpdir(), 'diffkit-smoke-')))
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
    return r.stdout.trim()
  }
  git('init', '-q', '-b', 'main')
  mkdirSync(join(root, 'pkg'))
  writeFileSync(join(root, 'pkg', 'package.json'), '{}\n')
  writeFileSync(join(root, 'pkg', 'a.ts'), 'export const a = 1\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'initial')
  writeFileSync(join(root, 'pkg', 'a.ts'), 'export const a = 2\nexport const b = 3\n')
  git('commit', '-q', '-a', '-m', 'change')

  // The binary prints a manifest the exported schema accepts: the changed file is kept,
  // in one group rooted at its package.
  const prep = spawnSync(process.execPath, [bin, 'prep', '--base', 'HEAD~1'], {
    cwd: root,
    env,
    encoding: 'utf8',
  })
  assert.equal(prep.status, 0, `diffkit prep exited ${prep.status}: ${prep.stderr}`)
  const manifest = prepManifestSchema.parse(JSON.parse(prep.stdout))
  assert.deepEqual(
    manifest.files.kept.map((f) => f.path),
    ['pkg/a.ts'],
  )
  assert.deepEqual(manifest.groups[0].roots, ['pkg'])
  assert.deepEqual(manifest.thresholds, DEFAULT_THRESHOLDS)
} finally {
  rmSync(root, { recursive: true, force: true })
}

const help = spawnSync(process.execPath, [bin, '--help'], { encoding: 'utf8' })
assert.equal(help.status, 0, `diffkit --help exited ${help.status}: ${help.stderr}`)
assert.match(help.stdout, /diffkit/)

// `--version` prints the version stamped from package.json.
const pkg = JSON.parse(readFileSync(join(dist, '..', 'package.json'), 'utf8'))
const version = spawnSync(process.execPath, [bin, '--version'], { encoding: 'utf8' })
assert.equal(version.status, 0, `diffkit --version exited ${version.status}: ${version.stderr}`)
assert.equal(version.stdout, `diffkit ${pkg.version}\n`)

console.log('diffkit smoke: OK')
