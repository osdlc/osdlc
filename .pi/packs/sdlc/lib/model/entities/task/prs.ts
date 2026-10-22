/**
 * The task `prs:` frontmatter read/write API.
 *
 * `prs:` is declared on exactly ONE entity schema — the task's
 * (`entities/task/schema.ts`) — so these helpers are task domain logic, not
 * generic frontmatter machinery, and they live here rather than in `lib/util`,
 * which carries only entity-agnostic pieces. Genuinely generic PR helpers
 * belong to the gh client (`@osdlc/typed-gh`).
 *
 * `prs:` is written ONCE, in the terminal close commit
 * ([[T-IVEJ-prs-once-at-close]]): `sdlc task close-commit` folds every PR URL
 * the task produced into the list through {@link computeAppendMany}. The
 * mid-flight per-PR append to `main` is retired — at PR-open the live binding
 * is the lease's `pr_number`, not this field.
 *
 * Exit-code contract, preserved deliberately: {@link PrsFieldError} encodes
 * `2` = task file not found and `1` = everything else. It is the read/write
 * failure taxonomy the close op surfaces; collapsing the two would flatten a
 * "task file missing" diagnostic into a generic parse failure.
 */

import { readFileSync, writeFileSync } from 'node:fs'

import { isFile } from '@lib/util/fs'
import { editFrontmatterFields, parseFrontmatterResult } from '@lib/util/frontmatter'

export type AppendAction = 'noop' | 'create' | 'append'

export interface AppendResult {
  action: AppendAction
  newList: string[]
  addendum: string | null
}

/** Thrown by prs: helpers to carry a process exit code. */
export class PrsFieldError extends Error {
  readonly exitCode: number
  constructor(message: string, exitCode = 1) {
    super(message)
    this.name = 'PrsFieldError'
    this.exitCode = exitCode
  }
}

export interface ReadResult {
  prs: string[] | null
  fm: Record<string, unknown>
  text: string
}

/**
 * Parse the YAML frontmatter, validate the shape of prs:, and return
 * the parsed list (or null), the full frontmatter object, and the original
 * file text.
 */
export function readPrsFrontmatter(path: string): ReadResult {
  if (!isFile(path)) {
    throw new PrsFieldError(`task file not found: ${path}`, 2)
  }
  const text = readFileSync(path, 'utf-8')
  const { fm, parseError } = parseFrontmatterResult(text)
  if (fm === null) {
    // Three distinct operator problems, kept distinct. The absent-block and
    // non-mapping messages are the ones this helper always emitted; malformed
    // YAML previously escaped as a raw YAMLParseError from the `yaml` package,
    // bypassing the PrsFieldError exit-code contract entirely — it now carries
    // the library's line/column diagnostic under exit 1.
    const message =
      parseError === 'no YAML frontmatter block found'
        ? `task file has no YAML frontmatter block: ${path}`
        : parseError !== null && parseError.startsWith('YAML parse error:')
          ? `task frontmatter is not valid YAML: ${path}: ${parseError}`
          : `task frontmatter is not a YAML mapping: ${path}`
    throw new PrsFieldError(message, 1)
  }

  const existing = fm['prs']
  if (existing === undefined || existing === null) {
    return { prs: null, fm, text }
  }
  if (!Array.isArray(existing)) {
    throw new PrsFieldError(`prs: field must be a list (got ${typeof existing}): ${path}`, 1)
  }
  for (let i = 0; i < existing.length; i++) {
    if (typeof existing[i] !== 'string') {
      throw new PrsFieldError(`prs:[${i}] is not a string (${typeof existing[i]}): ${path}`, 1)
    }
  }
  return { prs: [...(existing as string[])], fm, text }
}

/**
 * The commit-body line for one landed url. The close commit is the field's
 * only writer, so a landed url is the expected path, not an anomaly worth
 * apologizing for in the body.
 */
function addendumFor(url: string): string {
  return `Recorded PR ${url} in prs:.`
}

/**
 * Pure function classifying a single-url prs: append as create / noop /
 * append. The one-url case of {@link computeAppendMany}.
 */
export function computeAppend(existing: string[] | null, url: string): AppendResult {
  return computeAppendMany(existing, [url])
}

/**
 * Fold N urls into an existing list, in the order given, skipping any already
 * present. The aggregate {@link AppendAction} answers "what happened to the
 * field": `create` when the field was absent and at least one url landed,
 * `append` when it existed and at least one url landed, `noop` when nothing
 * landed (every url already present, or none supplied).
 *
 * Idempotent by construction: re-running with the same urls against the
 * resulting list yields `noop` and an unchanged list. Duplicates WITHIN `urls`
 * collapse too — the second occurrence sees the first already in the list.
 *
 * The addendum is the per-url commit-body lines joined by newlines, or null on
 * `noop`.
 */
export function computeAppendMany(
  existing: string[] | null,
  urls: readonly string[],
): AppendResult {
  let list = existing === null ? [] : [...existing]
  const addenda: string[] = []
  for (const url of urls) {
    if (list.includes(url)) continue
    list = [...list, url]
    addenda.push(addendumFor(url))
  }
  if (addenda.length === 0) {
    return { action: 'noop', newList: list, addendum: null }
  }
  return {
    action: existing === null ? 'create' : 'append',
    newList: list,
    addendum: addenda.join('\n'),
  }
}

/**
 * Set the `prs:` field in place, span-preserving. Returns true iff bytes
 * changed.
 *
 * Emission goes through {@link editFrontmatterFields} — `@osdlc/yaml-splice`'s
 * span-preserving `editYaml` — so ONLY the `prs:` field's bytes change and
 * every other field (comments, key order, quoting, blank lines) survives
 * verbatim. Every task-file writer is span-preserving, so each touches only
 * its own field and two writers in one run can never fight over the same
 * bytes.
 *
 * The fences come from the document itself, so a file's own line endings and
 * close-fence spacing survive the rewrite.
 */
export function writePrsFrontmatter(path: string, originalText: string, newPrs: string[]): boolean {
  const result = editFrontmatterFields(originalText, [{ Set: { key: 'prs', value: [...newPrs] } }])
  if (result === null) {
    throw new PrsFieldError(`frontmatter block disappeared between read and write: ${path}`, 1)
  }
  if (!result.changed) {
    return false
  }
  writeFileSync(path, result.text, 'utf-8')
  return true
}
