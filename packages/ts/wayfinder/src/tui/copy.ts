/**
 * `^y`: a task's command line on the clipboard.
 */

import { spawnRunnerAsync } from '@osdlc/command-seam'

/** One clipboard program and its arguments. */
export interface ClipboardCommand {
  binary: string
  args: string[]
}

/**
 * The clipboard programs to try, in order: `pbcopy` on macOS; `wl-copy` under
 * Wayland, then `xclip` and `xsel` elsewhere. None on Windows yet.
 */
export function clipboardCommands(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
): ClipboardCommand[] {
  if (platform === 'darwin') return [{ binary: 'pbcopy', args: [] }]
  if (platform === 'win32') return []
  const x11: ClipboardCommand[] = [
    { binary: 'xclip', args: ['-selection', 'clipboard'] },
    { binary: 'xsel', args: ['--clipboard', '--input'] },
  ]
  return env['WAYLAND_DISPLAY'] ? [{ binary: 'wl-copy', args: [] }, ...x11] : x11
}

/** How long a clipboard program may take before it is given up on. */
export const CLIPBOARD_TIMEOUT_MS = 2000

/**
 * Put `text` on the clipboard. True when a program took it.
 *
 * Async with a deadline, so the screen keeps answering keys. `xclip` and
 * `wl-copy` fork a child that holds the selection and can keep the output
 * pipes open; the async runner settles soon after the program itself exits
 * and closes the pipes, and the child keeps the selection. stdin is closed
 * once the text is written.
 */
export async function writeClipboard(
  text: string,
  opts: { cwd: string; platform: NodeJS.Platform; env: Record<string, string | undefined> },
): Promise<boolean> {
  for (const command of clipboardCommands(opts.platform, opts.env)) {
    const res = await spawnRunnerAsync(command.binary, { absolutePathOnly: true }).run(
      command.args,
      { cwd: opts.cwd, input: text, timeoutMs: CLIPBOARD_TIMEOUT_MS },
    )
    if (res.reason === 'spawn') continue
    return res.exitCode === 0
  }
  return false
}
