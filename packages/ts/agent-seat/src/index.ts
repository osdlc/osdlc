/**
 * `@osdlc/agent-seat`: put an interactive coding-agent session in front of a
 * person, in the terminal app, multiplexer or editor they already use.
 *
 * A {@link Host} is one place a session can open: a terminal tab, a tmux
 * session, a WezTerm pane, a VS Code terminal. A host fulfils the contract in
 * parts (open a session, run a command, send text, find, focus, capture,
 * close); a caller asks for the part it needs with {@link requirePart} and gets
 * a {@link HostPartMissing} error when the host lacks it, never a silent
 * fallback to another host.
 *
 * A {@link Harness} is the agent CLI the session runs (claude, codex, ...).
 * Every host runs any harness through {@link harnessArgv}, so where a session
 * opens and which agent runs in it are independent choices.
 *
 * {@link hostRegistry} builds every built-in host. Hosts that remember panes or
 * read an IDE companion's registry keep their files under the caller's
 * `runtimeDir`.
 */

import type { HostRegistry } from './contract.ts'
import { makeCmuxHost } from './hosts/cmux.ts'
import { makeHerdrHost } from './hosts/herdr.ts'
import { makeJetbrainsHost, type JetbrainsSettings } from './hosts/jetbrains.ts'
import { makeOrcaHost } from './hosts/orca.ts'
import { makeOttyHost } from './hosts/otty.ts'
import { terminalHost } from './hosts/terminal.ts'
import { makeTmuxHost } from './hosts/tmux.ts'
import { makeVscodeHost } from './hosts/vscode.ts'
import { makeWeztermHost } from './hosts/wezterm.ts'

export {
  HOST_NAMES,
  HostNameSchema,
  HostPartMissing,
  WAIT_TIMEOUT_EXIT,
  hostCanWait,
  onPath,
  requirePart,
  supportsPlatform,
  type CommandRequest,
  type FindQuery,
  type FoundSession,
  type Host,
  type HostName,
  type HostPart,
  type HostParts,
  type HostRegistry,
  type OpenedWorkspace,
  type OpenWorkspaceQuery,
  type SendReceipt,
  type SendRequest,
  type SessionRequest,
  type WaitRequest,
} from './contract.ts'
export {
  CLAUDE_HOOK_EVENTS,
  ClaudeSessionFlagsSchema,
  HarnessSchema,
  claudeHookSettings,
  claudeResumeArgv,
  claudeSessionArgv,
  codexSessionsDir,
  findCodexSessionId,
  harnessArgv,
  harnessAvailable,
  harnessNativeSend,
  harnessOrNull,
  hasInteractiveArgv,
  parseRolloutMeta,
  walkRolloutFiles,
  withEnv,
  wrapperSession,
  type ClaudeLaunchFlags,
  type ClaudeSessionFlags,
  type Harness,
  type NativeSendResult,
} from './harness.ts'
export { ensureWorkspace } from './open-workspace.ts'
export { makeCmuxHost } from './hosts/cmux.ts'
export { makeHerdrHost } from './hosts/herdr.ts'
export { JETBRAINS_PROTOCOL, makeJetbrainsHost, type JetbrainsSettings } from './hosts/jetbrains.ts'
export { ORCA_BUNDLED_CLI, makeOrcaHost } from './hosts/orca.ts'
export { makeOttyHost } from './hosts/otty.ts'
export { hostRegistryDir, type HostStateOptions } from './hosts/registry.ts'
export { makeTerminalHost, terminalHost } from './hosts/terminal.ts'
export {
  insideTmux,
  makeTmuxHost,
  tmuxAttachArgv,
  tmuxIdSessionName,
  tmuxSessionName,
  tmuxSwitchClientArgv,
} from './hosts/tmux.ts'
export { makeVscodeHost } from './hosts/vscode.ts'
export {
  liveWindows,
  subprocessTransport,
  type VscodeReply,
  type VscodeTransport,
  type VscodeWindow,
} from './hosts/vscode-client.ts'
export { makeWeztermHost } from './hosts/wezterm.ts'

/** What {@link hostRegistry} needs. */
export interface HostRegistryOptions {
  /**
   * The caller's runtime directory. Hosts that keep state use
   * `<runtimeDir>/hosts/<name>`; the VS Code and JetBrains companions register
   * there too, so they must be given the same directory.
   */
  runtimeDir: string
  /** Lets Orca register this repository when it does not know the worktree. */
  repoRoot?: string | undefined
  /** Which JetBrains IDEs may host a session; none means any. */
  jetbrains?: JetbrainsSettings | undefined
}

/**
 * Every built-in host, by name. Each one is a wrapper: it opens a terminal or
 * workspace and runs whichever harness the request names, so none hardcodes an
 * agent CLI. A consumer that wants a fake builds its own `HostRegistry`.
 */
export function hostRegistry(opts: HostRegistryOptions): HostRegistry {
  const { runtimeDir } = opts
  return {
    terminal: terminalHost,
    orca: makeOrcaHost({ repoRoot: opts.repoRoot, runtimeDir }),
    cmux: makeCmuxHost({}),
    tmux: makeTmuxHost({}),
    herdr: makeHerdrHost({ runtimeDir }),
    otty: makeOttyHost(),
    wezterm: makeWeztermHost({ runtimeDir }),
    vscode: makeVscodeHost({ runtimeDir }),
    jetbrains: makeJetbrainsHost({ runtimeDir, settings: opts.jetbrains }),
  }
}
