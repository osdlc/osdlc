// Runs the built package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name to it), so dist/ is compiled but
// never run anywhere else. A broken emit passes every other check and fails on
// the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.ts copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.
//
// Also runs the installed command: `story-shots` with no arguments prints its
// usage and exits 2, before it looks for Docker.

import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { seeded } from '@osdlc/story-harness/browser'
import { defineStoryConfig, storyUrl } from '@osdlc/story-harness/playwright'
import { captureStories, serveStatic } from '@osdlc/story-harness/runner'

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
const usage = spawnSync(process.execPath, [bin], { encoding: 'utf8' })
assert.equal(usage.status, 2, `story-shots exited ${usage.status}: ${usage.stderr}`)
assert.match(usage.stderr, /usage: story-shots <package dir>/)

console.log('story-harness smoke: OK')
