/**
 * What a host may supply that this package cannot know for itself.
 *
 * A standalone run passes none; a host passes `annotate` so its verdicts are
 * in the sweep, the plan, and the re-check `check` and `run` make.
 */

import type { RepoInfo, Row } from './types.ts'

/**
 * Re-rank a repository's swept rows with what the host knows: change a
 * verdict, add a note, drop a row. Runs after classification, on its output;
 * it never reaches into it. A worktree the host holds back keeps its branch
 * too: the sweep applies that rule after the hook.
 */
export type Annotate = (repo: RepoInfo, rows: Row[]) => Row[]
