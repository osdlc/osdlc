/** Disk usage of a directory, read with `du` through the command seam. */

import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'

/** What {@link sizeOf} takes. */
export interface SizeOfOptions {
  /** Cap on the walk, in ms. Default 60 s. */
  timeoutMs?: number | undefined
  /** Runs `du`. Default spawns the real one. */
  du?: CommandRunner | undefined
}

const DEFAULT_TIMEOUT_MS = 60_000

/**
 * Bytes `path` takes on disk (`du -sk`: allocated blocks, not apparent size;
 * a symlink counts as itself). Null when the size could not be read: `du`
 * missing, failed, timed out or printed something else. A `du` that hit an
 * unreadable file still prints a total and exits non-zero; that total is
 * used, a floor of what is on disk.
 */
export function sizeOf(path: string, opts: SizeOfOptions = {}): number | null {
  const du = opts.du ?? spawnRunner('du')
  const r = du.run(['-sk', '--', path], {
    cwd: '/',
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  })
  if (r.neverExited === true) return null
  const kib = /^(\d+)\s/.exec(r.stdout)
  return kib === null ? null : Number(kib[1]) * 1024
}

/** `bytes` as a short size: `512 B`, `3.4 MB`. */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return unit === 0 ? `${value} B` : `${value.toFixed(1)} ${units[unit]}`
}
