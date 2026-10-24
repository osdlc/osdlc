/**
 * `@osdlc/cli-tool/devlink`: run a system-installed CLI tool from a
 * development checkout, and keep a history of which checkouts have been linked.
 *
 * A tool declares a {@link ToolSpec} once. Its launcher calls {@link resolve}
 * (or is rendered by {@link renderLauncher} when it must decide before a
 * JavaScript runtime exists) and runs whichever checkout wins: the explicit
 * `<NAME>_HOME` env, the checkout above the cwd, the linked checkout, or
 * itself. The `dev` verbs ({@link install}, {@link link}, {@link use},
 * {@link off}, {@link status}, {@link history}) manage the link. Every
 * selection is appended to a per-tool history, so `use #n` can return to any
 * earlier checkout and `use canonical` to the install.
 */

export {
  cwdDevVar,
  entryOf,
  envStem,
  homeVar,
  launchLayerVar,
  pathNames,
  quietVar,
  validateSpec,
} from './spec.ts'
export type { ToolSpec } from './spec.ts'

export { cwdCheckout, isCheckout, resolve, samePath, suppressed } from './resolve.ts'
export type { Local, ResolveOptions, Selected, Selection, Source } from './resolve.ts'

export {
  HISTORY_FILE,
  HOME_FILE,
  appendHistory,
  clearActive,
  historyPath,
  homePath,
  readActive,
  readHistory,
  stateDir,
  writeActive,
} from './state.ts'
export type { HistoryEvent, HistoryKind, StateOptions } from './state.ts'

export {
  DevlinkError,
  defaultBinDir,
  findOnPath,
  history,
  install,
  isOnPath,
  link,
  off,
  readShimTarget,
  renderShim,
  status,
  use,
} from './ops.ts'
export type {
  HistoryEntry,
  InstallInput,
  InstallResult,
  InstalledLink,
  LinkInput,
  LinkResult,
  LinkStatus,
  OffResult,
  OpOptions,
  ShimStatus,
  StatusResult,
  UseInput,
  UseResult,
} from './ops.ts'

export { gitHead } from './git-head.ts'
export type { GitHead } from './git-head.ts'

export { launcherCheckout, launcherDrift, renderLauncher } from './launcher.ts'
export type { LauncherOptions } from './launcher.ts'

export { execSelection } from './exec.ts'
export type { ExecOptions } from './exec.ts'

export { processIo, runDevCli, usage } from './cli.ts'
export type { CliIo, RunOptions } from './cli.ts'
