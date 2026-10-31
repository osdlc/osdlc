/**
 * One self-overwriting line on stderr saying what a run is doing, for a
 * terminal. The sweep is synchronous, so the line moves between steps and
 * between the items of a long step, not on a timer.
 */

import { homedir } from 'node:os'

import { fitWidth, stripControls } from '@osdlc/ux'

import type { Step } from './receipt.ts'
import type { SweepProgress } from './types.ts'

const STEP_TEXT: Record<SweepProgress['step'], string> = {
  discover: 'reading the repository',
  fetch: 'fetching',
  prs: 'listing pull requests (gh)',
  worktrees: 'checking worktrees',
  'local-branches': 'checking local branches',
  'remote-branches': 'checking remote branches',
}

/** `~/x` for a path under the home directory. */
function tilde(path: string, home: string): string {
  return path === home ? '~' : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path
}

/**
 * A sweep step as one line, e.g. `[2/5] checking remote branches 37/427 · ~/work/api`.
 * The path goes last, so a line cut to the terminal's width loses its tail first.
 */
export function describeSweep(p: SweepProgress, home: string = homedir()): string {
  const where = p.of > 1 ? `[${p.index}/${p.of}] ` : ''
  const count = p.done === undefined ? '' : ` ${p.done + 1}/${p.total}`
  const text =
    p.step === 'prs' && p.tool !== undefined
      ? `listing pull requests (${p.tool})`
      : STEP_TEXT[p.step]
  return `${where}${text}${count} · ${tilde(p.repo, home)}`
}

/** An apply step as one line, e.g. `deleting 3/7: delete-remote origin/feat/x`. */
export function describeStep(index: number, total: number, step: Step): string {
  const what = step.row === null ? step.repo : step.row.id
  return `deleting ${index + 1}/${total}: ${step.action} ${what}`
}

export interface StatusLine {
  /** Replace the line with `text`. */
  update(text: string): void
  /** Erase the line, so other output starts on a clean row. Idempotent. */
  clear(): void
}

/** A line drawn with `\r` and erase-line, controls stripped, cut to `columns() - 1` display columns so it never wraps. */
export function statusLine(write: (text: string) => void, columns: () => number): StatusLine {
  let shown = false
  return {
    update(text) {
      // Paths come off the disk: a name holding an escape or a newline must not
      // reach the terminal, and a wide character must not wrap the line.
      const width = Math.max(10, columns() - 1)
      write(`\r\x1b[2K${fitWidth(stripControls(text), width)}`)
      shown = true
    },
    clear() {
      if (!shown) return
      write('\r\x1b[2K')
      shown = false
    },
  }
}

/** A status line that draws nothing. */
export const NO_STATUS_LINE: StatusLine = { update() {}, clear() {} }
