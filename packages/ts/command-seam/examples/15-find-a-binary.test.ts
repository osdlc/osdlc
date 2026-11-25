/**
 * Need: configure only the tools that are installed, without running each
 * one to find out. Probing with `--version` is slow for some CLIs and has
 * side effects (update checks, telemetry) for others.
 *
 * `which(binary, opts?)` returns the path a spawn would run, or `undefined`.
 * It takes `env` like the runners, so a test points `PATH` at its own folder
 * instead of depending on what the machine has.
 *
 * A child that looks programs up itself, as git does for `ssh`, gets
 * `absolutePathEntries(PATH)` as its `PATH`, so it never finds one in the
 * folder it runs in either.
 */

import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, expect, test } from 'vitest'

import {
  absolutePathCandidates,
  absolutePathEntries,
  spawnRunnerAsync,
  which,
  type AbsolutePathOptions,
  type PathCandidateOptions,
  type SpawnRunnerOptions,
  type WhichOptions,
} from '@osdlc/command-seam'

// ---- Code under test -------------------------------------------------------

const HARNESSES = ['codex', 'claude', 'cursor-agent'] as const

/** The harnesses installed on this machine, in a fixed order. */
function installedHarnesses(opts: WhichOptions = {}): string[] {
  return HARNESSES.filter((h) => which(h, opts) !== undefined)
}

// ---- Tests -----------------------------------------------------------------

const bin = realpathSync(mkdtempSync(join(tmpdir(), 'seam-which-example-')))
afterAll(() => rmSync(bin, { recursive: true, force: true }))

function install(name: string): string {
  const file = join(bin, name)
  writeFileSync(file, '#!/bin/sh\n')
  chmodSync(file, 0o755)
  return file
}

// POSIX only: the stand-ins have no `.exe` or `.cmd` extension, so Windows rules do not match them; 19-find-on-windows covers Windows.
test.skipIf(process.platform === 'win32')(
  'only the binaries on PATH are reported, and nothing is run',
  () => {
    install('claude')
    expect(installedHarnesses({ env: { PATH: bin } })).toEqual(['claude'])
  },
)

// POSIX only: the stand-ins have no `.exe` or `.cmd` extension, so Windows rules do not match them; 19-find-on-windows covers Windows.
test.skipIf(process.platform === 'win32')(
  'which returns the absolute path a spawn would run',
  () => {
    const file = install('codex')
    expect(which('codex', { env: { PATH: bin } })).toBe(file)
    expect(which('cursor-agent', { env: { PATH: bin } })).toBeUndefined()
  },
)

// ---- Inside a folder you do not trust --------------------------------------

// POSIX only: the stand-ins have no `.exe` or `.cmd` extension, so Windows rules do not match them; 19-find-on-windows covers Windows.
test.skipIf(process.platform === 'win32')(
  'absolutePathOnly skips a relative PATH entry, so a planted binary never runs',
  async () => {
    const repo = realpathSync(mkdtempSync(join(tmpdir(), 'seam-which-repo-')))
    try {
      writeFileSync(join(repo, 'codex'), '#!/bin/sh\necho planted\n')
      chmodSync(join(repo, 'codex'), 0o755)
      const env = { PATH: `.:${bin}` }
      const opts: SpawnRunnerOptions = { absolutePathOnly: true }
      const r = await spawnRunnerAsync('codex', opts).run([], { cwd: repo, env })
      expect(r.stdout).toBe('')
      expect(which('codex', { cwd: repo, env, absolutePathOnly: true })).toBe(join(bin, 'codex'))
      const candidates: string[] = absolutePathCandidates('codex', {
        path: env.PATH,
        platform: 'linux',
      } satisfies PathCandidateOptions)
      expect(candidates).toEqual([join(bin, 'codex')])
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  },
)

// POSIX only: the stand-ins have no `.exe` or `.cmd` extension, so Windows rules do not match them; 19-find-on-windows covers Windows.
test.skipIf(process.platform === 'win32')(
  'a child that looks a program up itself gets only the absolute PATH entries',
  async () => {
    const repo = realpathSync(mkdtempSync(join(tmpdir(), 'seam-which-repo-')))
    try {
      writeFileSync(join(repo, 'gemini'), '#!/bin/sh\necho planted\n')
      chmodSync(join(repo, 'gemini'), 0o755)
      writeFileSync(join(bin, 'gemini'), '#!/bin/sh\necho installed\n')
      chmodSync(join(bin, 'gemini'), 0o755)
      // The shell looks `gemini` up on the PATH it is given, from `repo`.
      const opts: AbsolutePathOptions = { platform: process.platform }
      const path = absolutePathEntries(`.:${bin}:/usr/bin:/bin`, opts)
      expect(path).toBe(`${bin}:/usr/bin:/bin`)
      const sh = spawnRunnerAsync('sh', { absolutePathOnly: true })
      const r = await sh.run(['-c', 'gemini'], { cwd: repo, env: { PATH: path ?? '' } })
      expect(r.stdout.trim()).toBe('installed')
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  },
)
