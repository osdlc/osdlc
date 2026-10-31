/**
 * `apply`'s steps as a vertical list redrawn in place on a terminal: one row
 * per step with its own bar, empty while it waits, half full while it runs,
 * full and ticked when it is done, and a bar for the whole run under the
 * list. The run is synchronous, so the board moves between steps, not on a
 * timer.
 */

import { fitWidth, stripControls } from '@osdlc/ux'

import type { Step } from './receipt.ts'
import { PLAIN, type Style } from './render.ts'
import { progressBar } from './status-line.ts'

const BAR = 10

const VERB: Record<Step['action'], string> = {
  'unlock-worktree': 'unlock',
  'remove-worktree': 'delete',
  'delete-local': 'delete',
  'delete-remote': 'delete',
  'prune-worktrees': 'prune',
}

function label(step: Step): string {
  const verb = VERB[step.action]
  if (step.row === null) return verb
  return stripControls(`${verb.padEnd(6)}  ${step.row.category}  ${step.row.id}`)
}

/** One step's row: its bar, a mark, and what it does, cut to `width` columns. */
function stepRow(step: Step, running: boolean, width: number, style: Style): string {
  const text = fitWidth(label(step), Math.max(1, width - BAR - 6))
  if (step.result === 'ok') return `  ${style.keep('█'.repeat(BAR))} ${style.keep('✓')} ${text}`
  if (step.result === 'failed') {
    return `  ${style.delete('█'.repeat(BAR))} ${style.delete('✗')} ${text}`
  }
  if (running) {
    const half = '█'.repeat(BAR / 2) + '░'.repeat(BAR / 2)
    return `  ${style.review(half)} ${style.review('›')} ${style.strong(text)}`
  }
  return `  ${style.muted('░'.repeat(BAR))}   ${style.muted(text)}`
}

/**
 * The board's lines: the rows that fit in `height - 1` lines, then the bar
 * for the whole run. A list longer than that shows a window that keeps the
 * running step in view, with a line for the rows above and below it.
 */
export function boardLines(
  steps: readonly Step[],
  running: number | null,
  size: { width: number; height: number },
  style: Style = PLAIN,
): string[] {
  const room = Math.max(3, size.height - 1)
  let first = 0
  let last = steps.length
  if (steps.length > room) {
    const at = running ?? steps.findIndex((s) => s.result === 'pending')
    const focus = at < 0 ? steps.length - 1 : at
    // Two lines go to the "above" and "below" notes.
    const shown = room - 2
    first = Math.min(Math.max(0, focus - Math.floor(shown / 3)), steps.length - shown)
    last = first + shown
  }
  const lines: string[] = []
  if (steps.length > room) lines.push(style.muted(`  … ${first} above`))
  for (let i = first; i < last; i++) {
    lines.push(stepRow(steps[i]!, i === running, size.width, style))
  }
  if (steps.length > room) lines.push(style.muted(`  … ${steps.length - last} below`))
  const done = steps.filter((s) => s.result === 'ok' || s.result === 'failed').length
  const failed = steps.some((s) => s.result === 'failed')
  const total = `${progressBar(done, steps.length, 30)} ${done}/${steps.length}`
  lines.push(`  ${failed ? style.delete(total) : style.strong(total)}`)
  return lines
}

export interface StepBoard {
  /** Draw with `running` as the step under way, or null between steps. */
  draw(running: number | null): void
}

/**
 * A board on `write`. The first draw prints its lines; each later one moves
 * the cursor back to the board's first line and rewrites them. Lines are cut
 * to the width, so none wraps and the line count stays right.
 */
export function stepBoard(
  write: (text: string) => void,
  steps: readonly Step[],
  size: () => { width: number; height: number },
  style: Style = PLAIN,
): StepBoard {
  let drawn = 0
  return {
    draw(running) {
      const { width, height } = size()
      const lines = boardLines(steps, running, { width: Math.max(20, width - 1), height }, style)
      const up = drawn > 0 ? `\x1b[${drawn}A` : ''
      write(up + lines.map((l) => `\r\x1b[2K${l}\n`).join(''))
      drawn = lines.length
    },
  }
}
