/**
 * Shared fixtures: a temp root, directories rooted under it, fake checkouts, and
 * a fake `.git` so `gitHead` has something to read without spawning git.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { envVars, systemDirs, type TieredDirs } from '@osdlc/config-layers/dirs'
import type { ToolSpec } from '../../src/devlink/spec.ts'

export const SPEC: ToolSpec = {
  name: 'tooly',
  marker: 'src/cli.ts',
  launcher: 'bin/tooly',
  aliases: ['tooly-long'],
  suppressors: ['TOOLY_HARNESS'],
  vendorDirs: { vendor: 'com.example', envVars: envVars('TOOLY') },
}

export interface Sandbox {
  root: string
  home: string
  dirs: TieredDirs
  /** The config dir devlink writes under: `<home>/<config>/tooly`. */
  stateDir: string
  dispose(): void
}

export function sandbox(): Sandbox {
  // realpath: macOS hands out `/var/...` for a temp dir that is really
  // `/private/var/...`, and the bash launcher reports `pwd -P` paths.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'devlink-')))
  const home = join(root, 'home')
  mkdirSync(home, { recursive: true })
  const dirs = systemDirs(SPEC.vendorDirs, { home, env: {} })
  return {
    root,
    home,
    dirs,
    stateDir: dirs.standalone(SPEC.name).config().path,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  }
}

/** A directory carrying the marker and a launcher file. */
export function seedCheckout(dir: string, spec: ToolSpec = SPEC): string {
  mkdirSync(join(dir, 'src'), { recursive: true })
  mkdirSync(join(dir, 'bin'), { recursive: true })
  writeFileSync(join(dir, spec.marker), '// entry\n')
  writeFileSync(join(dir, spec.launcher), '#!/bin/sh\n', { mode: 0o755 })
  return dir
}

/** A minimal `.git` with HEAD on `branch` at `sha` (40 hex chars). */
export function seedGit(dir: string, branch: string, sha: string): void {
  mkdirSync(dirname(join(dir, '.git', 'refs', 'heads', branch)), { recursive: true })
  writeFileSync(join(dir, '.git', 'HEAD'), `ref: refs/heads/${branch}\n`)
  writeFileSync(join(dir, '.git', 'refs', 'heads', branch), `${sha}\n`)
}

export const SHA_A = 'a'.repeat(40)
export const SHA_B = 'b'.repeat(40)
