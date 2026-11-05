/**
 * Frontmatter shape for one harness in the beta corpus,
 * `corpora/beta/harnesses/<id>.md`. The id is the filename, so it is not
 * repeated here. Sources are upstream pages: vendor sites, docs, repositories
 * and release lists.
 */
import { z } from 'zod'

export const SURFACES = ['cli', 'ide', 'desktop', 'web'] as const
export const STATUSES = ['current', 'sunsetting', 'retired'] as const
export const VERSIONING = ['semver', 'date', 'unknown'] as const

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and hyphens')
const url = z.url({ protocol: /^https$/ })

/** A page that backs one or more field values. */
export const sourceSchema = z
  .object({
    url,
    title: z.string().min(1),
  })
  .strict()

export const harnessSchema = z
  .object({
    /** Display name, as the vendor writes it. */
    name: z.string().min(1),
    /** The company or organization that makes it. */
    vendor: z.string().min(1),
    /** The product's main page. */
    homepage: url,
    /** The start of its user documentation. */
    docs: url,
    /** The public source repository; omitted when the source is not public. */
    repository: url.optional(),
    /** SPDX license id; omitted when it is not open source. */
    license: z.string().min(1).optional(),
    /** Whether its source is published under an open-source license. */
    open_source: z.boolean(),
    /** The command a user types to start it; omitted when it has no CLI. */
    cli: z.string().min(1).optional(),
    /** Where it runs: terminal, editor, desktop app or browser. */
    surfaces: z.array(z.enum(SURFACES)).min(1),
    /** Whether the vendor still develops it. */
    status: z.enum(STATUSES),
    /** The harness id the vendor names as its replacement. */
    successor: id.optional(),
    /** The harness id it was forked from. */
    fork_of: id.optional(),
    /** How its releases are numbered. */
    versioning: z.enum(VERSIONING),
    /** The date this entry was last checked against its sources. */
    checked: z.iso.date(),
    /** The pages every value above comes from. */
    sources: z.array(sourceSchema).min(1),
  })
  .strict()
  .refine((h) => h.open_source || h.license === undefined, {
    message: 'license is only set when open_source is true',
    path: ['license'],
  })

export type Harness = z.infer<typeof harnessSchema>
