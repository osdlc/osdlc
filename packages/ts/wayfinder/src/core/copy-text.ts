/**
 * What Copy puts on the clipboard, in the terminal UI and the web view alike.
 *
 * A task is copied as its argv quoted for the platform's shell, never as
 * `display`, so a name like `x; touch PWNED #` pastes as one quoted word.
 * Text that holds a control character is not copied at all: an `ESC[201~`
 * ends a terminal's bracketed paste, and a newline would run the line, so
 * replacing them would still put text on the clipboard the person did not
 * see.
 *
 * Browser-safe: the quoting comes from `@osdlc/command-seam/quote`.
 */

import { commandString } from '@osdlc/command-seam/quote'
import type { Task } from '@osdlc/system-model/detect'

import { hasControls } from '../terminal-text.ts'
import type { SkillRow } from './skills.ts'

/** Why a copy was refused, as every surface says it. */
export const COPY_REFUSED = 'not copied: it holds a control character'

/** `text`, or null when it holds a control character. */
function clipboardText(text: string): string | null {
  return hasControls(text) ? null : text
}

/**
 * The line to paste for `task`: its argv quoted for `platform`'s shell, after
 * a change to the task's directory when it has its own. Null when the line
 * holds a control character, so it is not copied.
 */
export function taskCopyText(
  task: Pick<Task, 'argv' | 'cwd'>,
  platform: NodeJS.Platform,
): string | null {
  if (task.argv.length === 0) return null
  return clipboardText(
    commandString(task.argv, { platform, ...(task.cwd === '.' ? {} : { cwd: task.cwd }) }),
  )
}

/** `/<name>` for `skill`, or null when it holds a control character. */
export function skillCopyText(skill: Pick<SkillRow, 'invoke'>): string | null {
  return clipboardText(skill.invoke)
}
