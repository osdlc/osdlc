/**
 * `apply`'s steps as a vertical list redrawn in place on a terminal: one row
 * per step with its own bar, empty while it waits, half full while it runs,
 * full and ticked when it is done, and a bar for the whole run under the
 * list. The run is synchronous, so the board moves between steps, not on a
 * timer.
 */

import { fitWidth, stripControls } from '@osdlc/ux'

import type { Step } from './receipt.ts'
import { PLAIN, STEP_VERB, type Style } from './render.ts'
import { progressBar } from './status-line.ts'

/** A step bar's cells, and the run bar's at most. */
const BAR = 10
const TOTAL_BAR = 30

function label(step: Step): string {
  const verb = STEP_VERB[step.action]
  if (step.row === null) return verb
  return stripControls(`${verb.padEnd(6)}  ${step.row.category}  ${step.row.id}`)
}

/**
 * One step's row, cut to `width` columns before it is colored, so the color
 * codes never count against the width and the row never wraps.
 */
function stepRow(step: Step, running: boolean, width: number, style: Style): string {
  const [bar, mark, color, text]: [string, string, (t: string) => string, (t: string) => string] =
    step.result === 'ok'
      ? ['█'.repeat(BAR), '✓', style.keep, (t) => t]
      : step.result === 'failed'
        ? ['█'.repeat(BAR), '✗', style.delete, (t) => t]
        : running
          ? ['█'.repeat(BAR / 2) + '░'.repeat(BAR / 2), '›', style.review, style.strong]
          : ['░'.repeat(BAR), ' ', style.muted, style.muted]
  const head = `  ${bar} ${mark} `
  if (width <= head.length) return color(fitWidth(head, width))
  return `  ${color(bar)} ${color(mark)} ${text(fitWidth(label(step), width - head.length))}`
}

/** The run's bar and count, shrunk to fit `width` columns. */
function totalRow(
  done: number,
  total: number,
  failed: boolean,
  width: number,
  style: Style,
): string {
  const count = ` ${done}/${total}`
  const cells = Math.min(TOTAL_BAR, width - 2 - count.length)
  const line =
    cells > 0
      ? `  ${progressBar(done, total, cells)}${count}`
      : fitWidth(`  ${count.trim()}`, width)
  return failed ? style.delete(line) : style.strong(line)
}

/**
 * The board's lines, each at most `width` columns, and at most `height - 1`
 * of them: the cursor sits on the row under the last line, which must stay
 * on screen. That is the run's bar under the rows that fit; a list longer
 * than that shows a window that keeps the running step in view, with a line
 * for the rows above and below it when there is room for one.
 */
export function boardLines(
  steps: readonly Step[],
  running: number | null,
  size: { width: number; height: number },
  style: Style = PLAIN,
): string[] {
  const width = Math.max(1, size.width)
  const room = Math.max(1, size.height - 2)
  let first = 0
  let last = steps.length
  const windowed = steps.length > room
  // The above and below notes need a row each, and a row for a step besides.
  const notes = windowed && room >= 3
  if (windowed) {
    const at = running ?? steps.findIndex((s) => s.result === 'pending')
    const focus = at < 0 ? steps.length - 1 : at
    const shown = notes ? room - 2 : room
    first = Math.min(Math.max(0, focus - Math.floor(shown / 3)), steps.length - shown)
    last = first + shown
  }
  const note = (text: string): string => style.muted(fitWidth(text, width))
  const lines: string[] = []
  if (notes) lines.push(note(`  … ${first} above`))
  for (let i = first; i < last; i++) lines.push(stepRow(steps[i]!, i === running, width, style))
  if (notes) lines.push(note(`  … ${steps.length - last} below`))
  const done = steps.filter((s) => s.result === 'ok' || s.result === 'failed').length
  const failed = steps.some((s) => s.result === 'failed')
  lines.push(totalRow(done, steps.length, failed, width, style))
  return lines
}

export interface StepBoard {
  /** Draw with `running` as the step under way, or null between steps. */
  draw(running: number | null): void
}

/**
 * A board on `write`. The first draw prints its lines; each later one moves
 * the cursor back to the board's first line and rewrites them, erasing any
 * line an earlier, taller frame left below. Lines are cut to one column
 * short of the width, so none wraps and the line count stays right.
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
      const lines = boardLines(steps, running, { width: width - 1, height }, style)
      // A frame shorter than the last one blanks the rows the last one used.
      while (lines.length < drawn) lines.push('')
      const up = drawn > 0 ? `\x1b[${drawn}A` : ''
      write(up + lines.map((l) => `\r\x1b[2K${l}\n`).join(''))
      drawn = lines.length
    },
  }
}
