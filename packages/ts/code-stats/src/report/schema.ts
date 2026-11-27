import { z } from 'zod'

import { API_LANGUAGES } from '../analysis/api.ts'
import { CHANGE_CATEGORIES } from '../diff/categories.ts'
import { OPERATIONS } from '../diff/operations.ts'
import { ENTRY_KINDS, FILE_STATUSES } from '../diff/parse.ts'
import { FILE_GROUPS } from '../groups.ts'
import { CONTENT_KINDS } from '../scan/kinds.ts'
import { CHANGE_KINDS, UNREAD_KINDS } from '../types.ts'

const count = z.number().int().nonnegative()

/** An object with one `value` per key, its keys taken from a constant list. */
function keyed<K extends string, T extends z.ZodType>(keys: readonly K[], value: T) {
  return z.object(Object.fromEntries(keys.map((k) => [k, value])) as Record<K, T>)
}

export const kindCountsSchema = keyed(CONTENT_KINDS, count)

export const operationCountsSchema = keyed(OPERATIONS, count)

export const kindOperationsSchema = keyed(CONTENT_KINDS, operationCountsSchema).describe(
  'Changed lines by kind and operation. A changed or moved pair counts once, under its kind, so ' +
    'added + changed + moved is the lines a diff adds and removed + changed + moved the lines it ' +
    'removes. A pair whose lines are of two kinds counts as removed and added instead. A line ' +
    'moved across files counts in the file it moved to.',
)

/**
 * The Zod schema of the `count` report ({@link CountReport}), the shape of `code-stats count
 * --json`.
 */
export const countReportSchema = z.object({
  schema: z.literal(1),
  source: z.object({
    label: z.string(),
    commit: z.string().nullable().describe('Null for the working tree.'),
  }),
  paths: z
    .array(z.string())
    .describe(
      'The paths measured: from the directory counted, or from the repository root for a commit. Empty is all.',
    ),
  files: count,
  lines: count,
  kinds: kindCountsSchema.describe('Lines by kind, generated and vendored files left out.'),
  languages: z.array(
    z.object({
      language: z.string().nullable().describe('Null for files of no known language.'),
      files: count,
      lines: count,
      kinds: kindCountsSchema,
    }),
  ),
  groups: keyed(
    FILE_GROUPS,
    z.object({
      files: count,
      lines: count,
      kinds: kindCountsSchema.nullable().describe('Null for generated and vendored files.'),
    }),
  ),
  fileList: z
    .array(
      z.object({
        path: z.string(),
        language: z.string().nullable(),
        group: z.enum(FILE_GROUPS),
        lines: count,
        kinds: kindCountsSchema.nullable(),
      }),
    )
    .nullable()
    .describe('Per-file rows, when asked for.'),
  skipped: z.array(z.object({ path: z.string(), reason: z.enum(UNREAD_KINDS) })),
  notes: z.array(z.string()),
})
/**
 * The report {@link countDirectory}, {@link countTree} and {@link buildCountReport} return: lines
 * by kind, language and file group for a tree.
 */
export type CountReport = z.infer<typeof countReportSchema>

const lineDelta = z.object({ added: count, removed: count })
const names = z.array(z.string())

/** A change resolved to commits. */
export const changeSchema = z.object({
  kind: z.enum(CHANGE_KINDS),
  label: z
    .string()
    .describe('How output names it: `PR #7`, `a..b`, `main...HEAD`, `HEAD...worktree`.'),
  pr: z.number().nullable(),
  base: z
    .string()
    .nullable()
    .describe('The starting commit; null for a PR whose commits are not in this checkout.'),
  head: z
    .string()
    .nullable()
    .describe('The ending commit; null for the working tree, or for a PR not in this checkout.'),
})

export const dependencyEntrySchema = z.object({ name: z.string(), version: z.string() })

/** The dependencies one manifest's diff adds, removes and bumps. */
export const dependencyChangeSchema = z.object({
  file: z.string(),
  added: z.array(dependencyEntrySchema),
  removed: z.array(dependencyEntrySchema),
  bumped: z.array(z.object({ name: z.string(), from: z.string(), to: z.string() })),
})

/**
 * The Zod schema of the `diff` report ({@link DiffReport}), the shape of `code-stats diff --json`.
 */
export const diffReportSchema = z.object({
  schema: z.literal(1),
  change: changeSchema,
  files: count,
  lines: lineDelta.describe('Lines the diff adds and removes, every file included.'),
  kindOperations: kindOperationsSchema.describe(
    'Changed lines by kind and operation, generated, vendored and non-text files left out.',
  ),
  groups: keyed(FILE_GROUPS, lineDelta.extend({ files: count })),
  categories: z
    .array(
      z.object({
        category: z.enum(CHANGE_CATEGORIES),
        files: count,
        added: count,
        removed: count,
        top: names.describe('The files with the most changed lines, at most five.'),
      }),
    )
    .describe('Every file in one category; empty categories left out.'),
  fileList: z.array(
    z.object({
      path: z.string(),
      oldPath: z.string().nullable(),
      status: z.enum(FILE_STATUSES),
      entry: z.enum(ENTRY_KINDS),
      similarity: z.number().nullable().describe('Rename similarity, percent.'),
      binary: z.boolean(),
      language: z.string().nullable(),
      group: z.enum(FILE_GROUPS),
      category: z.enum(CHANGE_CATEGORIES),
      added: count,
      removed: count,
      kindOperations: kindOperationsSchema
        .nullable()
        .describe('Null for generated, vendored and non-text files.'),
    }),
  ),
  dependencies: z.array(dependencyChangeSchema),
  api: z.object({
    status: z.enum(['ok', 'skipped']),
    note: z.string().nullable(),
    changes: z.array(
      z.object({
        file: z.string(),
        language: z.enum(API_LANGUAGES),
        entry: z.boolean().describe('A package entry point (`index.*`).'),
        added: names,
        removed: names,
        changed: names,
      }),
    ),
  }),
  complexity: z.object({
    status: z.enum(['ok', 'skipped']),
    note: z.string().nullable(),
    analyzers: names,
    totalBefore: count,
    totalAfter: count,
    functionsChanged: count,
    files: z.array(
      z.object({
        path: z.string(),
        before: count,
        after: count,
        functionsBefore: count,
        functionsAfter: count,
      }),
    ),
    movers: z.array(
      z.object({
        path: z.string(),
        name: z.string(),
        before: count.nullable(),
        after: count.nullable(),
        delta: z.number().int(),
        anonymous: z
          .boolean()
          .describe('An unnamed function, matched by enclosing scope and position.'),
      }),
    ),
  }),
  notes: names.describe('Anything skipped, capped or estimated, and why.'),
})
/**
 * The report {@link diffChange} and {@link buildDiffReport} return: a change's lines by kind and
 * operation, file groups, change categories, dependency changes, API delta and complexity movers.
 */
export type DiffReport = z.infer<typeof diffReportSchema>
/**
 * Changed lines by content kind and operation.
 */
export type KindOperations = DiffReport['kindOperations']
/**
 * Lines per operation (added, removed, changed, moved) for one content kind.
 */
export type OperationCounts = KindOperations['logic']

/**
 * The Zod schema of the `compare` report ({@link CompareReport}), the shape of `code-stats compare
 * --json`.
 */
export const compareReportSchema = z.object({
  schema: z.literal(1),
  a: diffReportSchema,
  b: diffReportSchema,
})
/**
 * The report {@link compareChanges} returns: two {@link DiffReport}s, `a` and `b`, measured the
 * same way.
 */
export type CompareReport = z.infer<typeof compareReportSchema>

/** `from` depends on `to`, both package directories. */
export const packageDependencySchema = z.object({ from: z.string(), to: z.string() })

/** The packages a change touches and the ones that depend on them (`describe`). */
export const packageMapSchema = z.object({
  nodes: z.array(
    z.object({
      dir: z.string().describe("Relative to the repository root; '' is the root."),
      label: z
        .string()
        .describe(
          "The manifest names at `dir`; with none, the directory, or `(repository root)` for `''`.",
        ),
      status: z
        .enum(['changed', 'affected'])
        .describe('`changed` holds files of the change; `affected` depends on a changed package.'),
      files: count,
      added: count,
      removed: count,
      logic: count.describe('Logic lines added, changed or moved.'),
    }),
  ),
  edges: z.array(packageDependencySchema).describe('Dependencies between the nodes shown.'),
  omitted: count.describe('Changed packages left out to keep the map readable.'),
  omittedDependents: count.describe('Dependent packages left out for the same reason.'),
})
