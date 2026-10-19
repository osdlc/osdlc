/**
 * Shared task-document resolution for the task noun's read-only doc ops
 * (`check-claims`, `parse-touchpoints`, `scan-placeholders`).
 *
 * Underscore-prefixed: the registry's discovery walk skips this file (same
 * shared-core convention as `model/ops/_create.ts`).
 *
 * Thin op-facing veneer over the entity read layer ([[T-N9PM]]): the three
 * `task` positional spellings (absolute path / project-relative path / bare
 * basename) resolve through `model/read.ts#resolveInstanceDocPath`, and the
 * document itself comes from `readTask`. A non-resolving task file is an
 * `INVALID_INPUT` OpError (exit 1) — the argument was wrong, not the
 * repository state.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { OpError } from '@lib/registry'
import { resolveInstanceDocPath } from '@lib/model/read'

import { readTask } from '../read.ts'

/** Resolve the `task` positional to an absolute task-file path. */
export function resolveTaskDocPath(projectRoot: string, task: string): string {
  return resolveInstanceDocPath('task', projectRoot, task)
}

/**
 * Resolve and read the task document, failing with INVALID_INPUT when it is
 * absent. `fm` is the raw hydrated frontmatter off the read (either arm),
 * `null` when the document carries no frontmatter mapping.
 */
export function readTaskDoc(
  projectRoot: string,
  task: string,
): { path: string; text: string; fm: Record<string, unknown> | null } {
  const res = readTask(task, { projectRoot })
  if (res === null) {
    throw new OpError(
      'INVALID_INPUT',
      `task file not found: ${resolveTaskDocPath(projectRoot, task)}`,
    )
  }
  return { path: res.path, text: res.text, fm: res.fm }
}

/** Read the file a `--from` / `--body-file` flag names. Stdin never comes through here: the adapter delivers it (`stdinKey`). */
export function readTextSource(source: string, flag: string): string {
  if (source === '-') {
    throw new OpError(
      'INVALID_INPUT',
      `${flag} -: a file path is required, not stdin; pass the body with --body-text - to read stdin.`,
    )
  }
  try {
    return readFileSync(resolve(source), 'utf-8')
  } catch (err) {
    throw new OpError(
      'INVALID_INPUT',
      `${flag} ${source}: cannot read (${err instanceof Error ? err.message : String(err)})`,
    )
  }
}
