/**
 * Need: run a build (or a test run, or an interactive tool) whose output the
 * user must see live, then say in one line why it failed.
 *
 * `streamRunner` inherits stdin, stdout and stderr, so there is nothing to
 * capture; the result says only how the child ended. `ran` reads it the same
 * way it reads a captured result, and `reason` says why it never finished.
 * There is no ready-made stream fake; a test writes a small object.
 */

import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, expect, test } from 'vitest'

import {
  ran,
  streamRunner,
  type StreamResult,
  type StreamRunner,
  type StreamRunOptions,
} from '@osdlc/command-seam'

// ---- Code under test -------------------------------------------------------

class BuildFailed extends Error {}

/** Why a streamed build failed, in one line. */
function whyItFailed(r: StreamResult): string {
  switch (r.reason) {
    case 'timeout':
      return 'the build timed out'
    case 'spawn':
      return `could not start the build: ${r.error}`
    case 'signal':
      return `the build was killed by ${r.signal}`
    default:
      return `the build exited ${r.exitCode}`
  }
}

/** Run `npm run build` in `dir` with live output; throws when it fails. */
function build(dir: string, npm: StreamRunner = streamRunner('npm')): void {
  const opts: StreamRunOptions = { cwd: dir, timeoutMs: 10 * 60_000, env: { FORCE_COLOR: '1' } }
  const r = npm.run(['run', 'build'], opts)
  if (!ran(r)) throw new BuildFailed(whyItFailed(r))
}

// ---- Tests -----------------------------------------------------------------

/** A stream fake that ends every run with `result` and records the calls. */
function fakeNpm(result: StreamResult) {
  const calls: { argv: string[]; opts: StreamRunOptions }[] = []
  const runner: StreamRunner = {
    run(argv, opts) {
      calls.push({ argv, opts })
      return result
    },
  }
  return { runner, calls }
}

test('runs the build script with colour and a cap', () => {
  const npm = fakeNpm({ exitCode: 0 })

  build('/app', npm.runner)

  expect(npm.calls).toEqual([
    {
      argv: ['run', 'build'],
      opts: { cwd: '/app', timeoutMs: 600_000, env: { FORCE_COLOR: '1' } },
    },
  ])
})

test('each way of failing gets its own message', () => {
  const failures: [StreamResult, string][] = [
    [{ exitCode: 2 }, 'the build exited 2'],
    [
      { exitCode: 1, neverExited: true, reason: 'timeout', signal: 'SIGKILL' },
      'the build timed out',
    ],
    [
      { exitCode: 1, neverExited: true, reason: 'spawn', error: 'spawnSync npm ENOENT' },
      'could not start the build: spawnSync npm ENOENT',
    ],
    [
      { exitCode: 1, neverExited: true, reason: 'signal', signal: 'SIGINT' },
      'the build was killed by SIGINT',
    ],
  ]

  for (const [result, message] of failures) {
    expect(() => build('/app', fakeNpm(result).runner)).toThrow(new BuildFailed(message))
  }
})

// ---- The real runner -------------------------------------------------------

const scratch = mkdtempSync(join(tmpdir(), 'examples-build-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

test('a real streamed build leaves its output on disk', () => {
  // A stand-in `npm` that writes the bundle and prints nothing.
  const npm = join(scratch, 'npm')
  writeFileSync(npm, '#!/bin/sh\nmkdir -p dist && : > dist/index.js\n')
  chmodSync(npm, 0o755)

  build(scratch, streamRunner(npm))

  expect(existsSync(join(scratch, 'dist', 'index.js'))).toBe(true)
}, 15_000)
