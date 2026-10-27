/** Throwaway fixture directories for the config, trust and clean tests. */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { flushWrites } from '../src/core/writes.ts'

/** A throwaway directory tree. `files` maps root-relative paths to contents. */
export async function fixtureRoot(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'wayfinder-'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, content, 'utf-8')
  }
  return root
}

export async function removeRoot(root: string): Promise<void> {
  // A write still in flight would land after the directory is gone.
  await flushWrites()
  await rm(root, { recursive: true, force: true })
}

const WINDOWS = process.platform === 'win32'

/**
 * `line` as `list`, `query` and Copy print it on this platform: PowerShell's
 * on Windows, which starts with the call operator `&`. Only for lines whose
 * words quote the same way in sh and PowerShell.
 */
export function shown(line: string): string {
  return WINDOWS ? `& ${line}` : line
}

/**
 * The config home below the home directory when no XDG or APPDATA variable is
 * set: `.config` under the xdg convention, `AppData/Roaming` on Windows.
 */
export const CONFIG_HOME = WINDOWS ? 'AppData/Roaming' : '.config'

/** The state home below the home directory, as {@link CONFIG_HOME}. */
export const STATE_HOME = WINDOWS ? 'AppData/Local/state' : '.local/state'

/** The cache home below the home directory, as {@link CONFIG_HOME}. */
export const CACHE_HOME = WINDOWS ? 'AppData/Local' : '.cache'

/** The user config file below the home directory. */
export const USER_CONFIG = `${CONFIG_HOME}/wayfinder/config.json`
