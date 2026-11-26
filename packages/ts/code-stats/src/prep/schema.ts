/**
 * The `code-stats prep` manifest: one JSON document describing a change for a
 * reviewer, deterministic and free of any model. `schema` is the version of
 * this shape; a consumer should refuse a number it does not know.
 *
 * The change and each file's group, category and language are those of the
 * change's `DiffReport`, in its vocabulary.
 */

import { CHANGE_CATEGORIES } from '../diff/categories.ts'
import { FILE_STATUSES } from '../diff/parse.ts'
import { FILE_GROUPS } from '../groups.ts'
import { diffReportSchema } from '../report/schema.ts'
import { z } from 'zod'

export const DROP_REASONS = ['generated', 'vendored', 'formatting-only'] as const
export const FLAG_KINDS = ['long-function', 'test-only-export'] as const

/** What a flag was measured against; recorded so a reader can see how strict the run was. */
export const thresholdsSchema = z.object({
  longFunctionLines: z.number().describe('A function this long or longer can be flagged.'),
  longFunctionAddedShare: z
    .number()
    .describe('...when MORE than this share of its lines is added in this change.'),
  groupSize: z.number().describe('Files per group before a package group is split; 0 is off.'),
})

/**
 * The zod schema of the `code-stats prep` manifest, `schema: 2`. A consumer
 * should refuse a `schema` number it does not know. The `change` shape and the
 * group, category and status words are code-stats'.
 */
export const prepManifestSchema = z.object({
  schema: z.literal(2),
  change: diffReportSchema.shape.change.describe(
    'The change as code-stats resolved it. `head` is null for the working tree.',
  ),
  coverage: z
    .array(z.literal('ts'))
    .describe('Languages the flags cover. A language not listed has no flags, which is not clean.'),
  thresholds: thresholdsSchema,
  files: z.object({
    kept: z.array(
      z.object({
        path: z.string(),
        status: z.enum(FILE_STATUSES),
        group: z.enum(FILE_GROUPS).describe("The file's code-stats group."),
        category: z
          .enum(CHANGE_CATEGORIES)
          .describe(
            "The file's code-stats change category; `comments` marks a file whose change is only comments.",
          ),
        language: z.string().nullable().describe('Null for a file of no known language.'),
        added: z.number(),
        removed: z.number(),
      }),
    ),
    dropped: z.array(
      z.object({
        path: z.string(),
        reason: z
          .enum(DROP_REASONS)
          .describe(
            '`generated` and `vendored` are the code-stats groups (lockfiles are generated); `formatting-only` its `formatting` category.',
          ),
      }),
    ),
  }),
  groups: z.array(
    z.object({
      id: z.string(),
      roots: z
        .array(z.string())
        .describe(
          'The package roots this group holds (a directory with a manifest file; `.` is the repo root). One entry unless small groups were packed together.',
        ),
      files: z.array(z.string()),
      lines: z.number().describe('Added plus removed lines across the group.'),
    }),
  ),
  flags: z.array(
    z.object({
      kind: z.enum(FLAG_KINDS),
      basis: z.enum(['measured', 'heuristic']),
      path: z.string(),
      line: z.number(),
      group: z.string(),
      detail: z.string(),
      measurements: z.record(z.string(), z.json()),
    }),
  ),
  notes: z.array(z.string()).describe('Any check that could not run, and why.'),
})

/** The manifest `runPrep` returns, as `prepManifestSchema` infers it. */
export type PrepManifest = z.infer<typeof prepManifestSchema>
/** The numbers a run measured against: long-function size and added share, and group size. */
export type Thresholds = z.infer<typeof thresholdsSchema>
/** One reading-order flag: where to look first, and the measurements behind it. */
export type PrepFlag = PrepManifest['flags'][number]
/** A file worth reading, with its group, category, language and line counts. */
export type PrepFile = PrepManifest['files']['kept'][number]
/** The kept files one reviewer is handed, with the package roots they sit under. */
export type PrepGroup = PrepManifest['groups'][number]
