/**
 * A synchronous y/N prompt on the terminal, for `--confirm-push`.
 *
 * Synchronous because the `ConfirmPush` port is (`../ports.ts`). The prompt runs between building an
 * update and pushing it, inside `updateOne`.
 */

import { askYesNo, canPrompt } from '@osdlc/cli-tool'

import type { ConfirmPush, PushPreview } from '../ports.ts'

export function formatPreview(p: PushPreview): string {
  const lines = [
    `#${p.number}  ${p.head} onto ${p.base}`,
    `${p.commits.length} commit(s) to push, replacing ${p.replaced}:`,
    ...p.commits.map((c) => `  ${c}`),
  ]
  if (p.diffstat !== '') lines.push(p.diffstat)
  return `${lines.join('\n')}\n`
}

/**
 * A `ConfirmPush` that writes the preview to stderr (or `write`) and reads the
 * answer from stdin. Throws when stdin or stderr is not a terminal, since
 * nobody could see the preview or answer.
 */
export function terminalConfirmPush(
  write: (text: string) => void = (text) => process.stderr.write(text),
): ConfirmPush {
  if (!canPrompt()) {
    throw new Error('--confirm-push needs a terminal on stdin and stderr')
  }
  return (preview) =>
    askYesNo(`\n${formatPreview(preview)}Force-push to ${preview.head}?`, { write })
}
