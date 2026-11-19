/**
 * What a host may supply that this package cannot know for itself.
 *
 * A standalone run passes none; a host passes `annotate` so its verdicts are
 * in the sweep, the plan, and the re-check `check` and `run` make.
 */

import type { RepoInfo, Row, WorktreeRow } from './types.ts'

/**
 * Re-rank a repository's swept rows with what the host knows: change a
 * verdict, add a note, drop a row. Runs after classification, on its output;
 * it never reaches into it. A worktree the host holds back keeps its branch
 * too: the sweep applies that rule after the hook.
 */
export type Annotate = (repo: RepoInfo, rows: Row[]) => Row[]

/** How a host removes one worktree, in place of `git worktree remove`. */
export interface WorktreeRemoval {
  /** The command line it stands for, shown in the preview and recorded in the receipt. */
  command: string
  /** Remove the worktree. Throws when it cannot; `run` verifies the result. */
  run(): void
}

/**
 * Take over the removal of a worktree the host manages, such as one a
 * terminal app keeps its own record of; null leaves it to git. `run` still
 * refuses a live process and an unsafe force before the removal, and checks
 * after it that the directory is gone and git no longer lists the worktree.
 */
export type RemoveWorktree = (
  worktree: WorktreeRow,
  ctx: { repo: string; force: boolean },
) => WorktreeRemoval | null
