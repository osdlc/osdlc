/**
 * The one policy for opening a host's workspace before a launch: when
 * `host.open_workspace` is on and the host fulfils the optional
 * `openWorkspace` part, call it before `session`/`terminal`. `send`, `find`
 * and `focus` never come through here.
 */

import type { Host } from './contract.ts'

/** Opens a workspace for `cwd` on `host` when `enabled` and the host can; a host without the part is left alone. */
export function ensureWorkspace(
  host: Host,
  cwd: string,
  enabled: boolean,
  notice: (line: string) => void,
): void {
  if (!enabled || host.openWorkspace === undefined) return
  host.openWorkspace({ cwd, notice })
}
