// Runs the built package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name to it), so dist/ is compiled but
// never run anywhere else. A broken emit passes every other check and fails on
// the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here; the smoke check in
// packages/ts/package-checks/src/check-ts.ts runs it in a clean project that
// installed the tarball, so it must import nothing else from the repo.
//
// Also runs the installed command: with no arguments, or with a bad
// `--settle-ms` or `SHOT_WORKERS`, `story-shots` exits 2 before it looks for
// the build or Docker.

import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { A11Y_OPTIONS } from '@osdlc/story-harness/a11y'
import { seeded } from '@osdlc/story-harness/browser'
import { slug } from '@osdlc/story-harness/parley-capture'
import { defineStoryConfig, storyUrl } from '@osdlc/story-harness/playwright'
import { captureStories, serveStatic, walkPage } from '@osdlc/story-harness/runner'

const a = seeded(7)
const b = seeded(7)
assert.equal(a(), b())

const config = defineStoryConfig({ port: 6106, mode: 'perf', configDir: tmpdir() })
assert.equal(config.workers, 1)
// The config's static server is the built serve-static.js beside it.
const command = config.webServer.command
const script = JSON.parse(command.slice('node '.length, command.indexOf('" ') + 1))
assert.ok(script.endsWith('serve-static.js') && existsSync(script), command)
assert.equal(
  storyUrl('http://x', 'a--b', 'dark'),
  'http://x/iframe.html?id=a--b&viewMode=story&globals=theme:dark',
)
assert.equal(typeof captureStories, 'function')
assert.equal(typeof walkPage, 'function')
assert.equal(A11Y_OPTIONS.rules.region.enabled, false)
assert.equal(slug('A b'), 'a-b')

const dir = mkdtempSync(join(tmpdir(), 'story-harness-smoke-'))
try {
  writeFileSync(join(dir, 'index.json'), '{"entries":{}}')
  const close = await serveStatic(dir, 0)
  close()
} finally {
  rmSync(dir, { recursive: true, force: true })
}

// The command sits beside dist/ in the package, installed or not.
const dist = dirname(dirname(fileURLToPath(import.meta.resolve('@osdlc/story-harness/runner'))))
const bin = join(dist, '..', 'bin', 'story-shots.js')
assert.ok(existsSync(join(dist, 'runner', 'story-shots.sh')), 'dist/runner/story-shots.sh ships')
assert.ok(existsSync(join(dist, 'runner', 'platform.sh')), 'dist/runner/platform.sh ships')
for (const name of ['story-a11y.e2e.js', 'story-walk.e2e.js', 'aggregate-report.js'])
  assert.ok(existsSync(join(dist, 'runner', name)), `dist/runner/${name} ships`)
const usage = spawnSync(process.execPath, [bin], { encoding: 'utf8' })
assert.equal(usage.status, 2, `story-shots exited ${usage.status}: ${usage.stderr}`)
assert.match(usage.stderr, /usage: story-shots <package dir>/)

const refused = (args, env, message) => {
  const run = spawnSync(process.execPath, [bin, tmpdir(), ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  assert.equal(run.status, 2, `story-shots ${args.join(' ')} exited ${run.status}: ${run.stderr}`)
  assert.match(run.stderr, message)
}
refused(['--settle-ms', 'abc'], {}, /--settle-ms takes a whole number/)
refused(['--settle-ms', '1.5'], {}, /--settle-ms takes a whole number/)
refused(['--settle-ms'], {}, /--settle-ms needs a value/)
refused([], { SHOT_WORKERS: '0' }, /SHOT_WORKERS takes a whole number of at least 1/)
refused(['--a11y', '--walk'], {}, /pass one of --update, --a11y and --walk/)
refused(['--walk'], { WALK_MAX: '0' }, /WALK_MAX takes a whole number of at least 1/)
refused([], { SHOT_WORKERS: 'two' }, /SHOT_WORKERS takes a whole number of at least 1/)

console.log('story-harness smoke: OK')
