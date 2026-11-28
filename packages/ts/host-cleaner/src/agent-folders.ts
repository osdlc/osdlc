/**
 * The folders where coding agents keep their own worktrees, which nothing may
 * be deleted in: the agent tracks what it made there and cleans up itself.
 * The core refuses every candidate in or holding one, for every plugin.
 */

import { homedir } from 'node:os'
import { resolve } from 'node:path'

import { realAbove } from './helpers.ts'
import { expandHome, within } from './ignore.ts'
import type { Candidate, RunCtx } from './types.ts'

/** The refusal of a candidate in, or holding, a folder where an agent keeps its worktrees. */
export const AGENT_WORKTREE = 'agent-worktree'

/**
 * Cursor's agent worktrees: `cursor-agent --help` says `--worktree` starts in
 * `~/.cursor/worktrees/<reponame>/<name>`, and Cursor's staff say the path is
 * fixed, with no setting (https://forum.cursor.com/t/configure-worktree-location/149222).
 */
export const CURSOR_WORKTREES = '~/.cursor/worktrees'

/**
 * The folders refused on every run, whatever the config's `agentFolders` adds.
 *
 *   `~/.cursor/worktrees`  Cursor; see {@link CURSOR_WORKTREES}.
 *   `~/.codex/worktrees`   The Codex app makes its worktrees in `$CODEX_HOME/worktrees`
 *                          (https://learn.chatgpt.com/docs/environments/git-worktrees), and
 *                          `CODEX_HOME` is `~/.codex` when unset (codex-rs/utils/home-dir/src/lib.rs).
 *                          A moved `CODEX_HOME` or worktree root goes in the config.
 */
export const DEFAULT_AGENT_FOLDERS: readonly string[] = [CURSOR_WORKTREES, '~/.codex/worktrees']

/**
 * The run's agent folders as absolute paths: the defaults, under `ctx.home`
 * (the process's home when unset), and `ctx.agentFolders`.
 */
export function agentFoldersOf(ctx: Pick<RunCtx, 'home' | 'agentFolders' | 'cwd'>): string[] {
  const home = ctx.home ?? homedir()
  const defaults = DEFAULT_AGENT_FOLDERS.map((f) => resolve(ctx.cwd, homeFolder(f, home)))
  return [...new Set([...defaults, ...(ctx.agentFolders ?? [])])]
}

/** `folder`, such as one of {@link DEFAULT_AGENT_FOLDERS}, with a leading `~` taken as `home`. */
export const homeFolder = (folder: string, home: string): string => expandHome(folder, () => home)

/**
 * The agent folder that `path` is in, or with `holds` that it holds, by its own
 * spelling or its real path; undefined for none. Both sides resolve through the
 * links above what is gone, so a prunable worktree, or a folder made after the
 * run began, is still found.
 */
export function agentFolderAt(
  path: string,
  folders: readonly string[],
  holds = true,
): string | undefined {
  if (folders.length === 0) return undefined
  const forms = [path, realAbove(path)]
  return folders.find((dir) => {
    const dirs = [dir, realAbove(dir)]
    return forms.some((p) => dirs.some((d) => within(p, d) || (holds && within(d, p))))
  })
}

/** The agent folder candidate `c` is in or holds: by its path, or a ref's by its `at`, which it does not hold. */
export const agentFolderOf = (c: Candidate, folders: readonly string[]): string | undefined =>
  c.path !== undefined
    ? agentFolderAt(c.path, folders)
    : c.at === undefined
      ? undefined
      : agentFolderAt(c.at, folders, false)

/** Why `c` is refused for `folder`. */
export const agentFolderReason = (c: Candidate, folder: string): string =>
  c.path !== undefined && folder !== c.path && within(folder, c.path)
    ? `it holds ${folder}, where a coding agent keeps its worktrees`
    : `it is in ${folder}, where a coding agent keeps its worktrees`
