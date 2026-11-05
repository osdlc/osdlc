/**
 * Frontmatter shapes for the alpha corpus, an Open Knowledge
 * Format (OKF) v0.2 bundle. Each file is one concept; `type` says which kind.
 * OKF requires only `type`; these schemas add what this dataset needs.
 *
 * A fact is a list of dated, sourced observations, never a single value, so
 * the history of a fact is part of the data.
 */
import { z } from 'zod'

export const VERSIONING = ['semver', 'date', 'unknown'] as const
export const EVIDENCE = ['docs', 'source', 'help-text', 'run', 'changelog', 'inferred'] as const

export const TYPE = {
  category: 'Subject Category',
  subject: 'Subject',
  harness: 'Harness',
  standard: 'Standard',
  fact: 'Harness Fact',
  probe: 'Harness Probe',
} as const

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and hyphens')
const subjectId = z
  .string()
  .regex(/^[a-z0-9-]+\/[a-z0-9-]+$/, 'use <category>/<name>, lowercase letters, digits and hyphens')
const isoDate = z.iso.date()

/** An OKF `sources` entry (OKF v0.2 §5.1). `id` is the key observations and footnotes cite. */
export const sourceSchema = z
  .object({
    id,
    resource: z.url({ protocol: /^https$/ }),
    title: z.string().min(1),
  })
  .strict()

const sources = z.array(sourceSchema).min(1)

/** OKF's recommended keys, shared by every concept here. */
const okfBase = {
  title: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
}

/** Display position among its siblings; the generated pages sort by it. */
const order = z.number().int().positive()

export const categorySchema = z
  .object({ type: z.literal(TYPE.category), ...okfBase, order })
  .strict()

/** A subject's id and category come from its path: `subjects/<category>/<name>.md`. */
export const subjectSchema = z
  .object({
    type: z.literal(TYPE.subject),
    ...okfBase,
    order,
    /** The model matters more than the harness here, so observations may name a `model`. */
    model_dependent: z.boolean().optional(),
  })
  .strict()

/** A harness's id comes from its path: `harnesses/<id>.md`. */
export const harnessSchema = z
  .object({
    /** `Harness` is a tool a developer runs; `Standard` is a spec several harnesses follow. */
    type: z.enum([TYPE.harness, TYPE.standard]),
    ...okfBase,
    order,
    /** The harness homepage (OKF `resource`), when a source names one. */
    resource: z.url().optional(),
    vendor: z.string().min(1),
    /** How `since`/`until` are spelled: semver releases, or dates for unversioned hosted products. */
    versioning: z.enum(VERSIONING),
    sources,
  })
  .strict()

export const observationSchema = z
  .object({
    /**
     * What held. An object; `supported` (true, false or "partial") is the
     * conventional headline field, the rest are subject-specific.
     */
    value: z.record(z.string(), z.unknown()),
    /** First harness version this holds in. null when the source names none. */
    since: z.string().min(1).nullable(),
    /** First version it no longer holds in. null when it still holds, or the end is not known. */
    until: z.string().min(1).nullable(),
    /** The date the source checked it. */
    observed: isoDate,
    /** The `sources[].id` backing the value. */
    source: id,
    /** The `sources[].id` of the repository note that recorded an upstream `source`. */
    via: id.optional(),
    /** A file, line or commit inside the source. */
    locator: z.string().min(1).optional(),
    /** The harness version the source was checked against, when it says. */
    checked_version: z.string().min(1).optional(),
    /** How the source learned it. */
    evidence: z.enum(EVIDENCE).optional(),
    /** The probe that produced a `run` observation; required with `evidence: run`. */
    probe: id.optional(),
    /** The model the observation was made with; only on subjects marked `model_dependent`. */
    model: z.string().min(1).optional(),
    note: z.string().min(1).optional(),
  })
  .strict()

export const openQuestionSchema = z
  .object({
    question: z.string().min(1),
    observed: isoDate,
    source: id,
  })
  .strict()

/** A fact's path is `facts/<harness>/<category>/<name>.md`; `harness` and `subject` must match it. */
export const factSchema = z
  .object({
    type: z.literal(TYPE.fact),
    ...okfBase,
    harness: id,
    subject: subjectId,
    /** Oldest first. */
    observations: z.array(observationSchema),
    /** What the sources leave unresolved about this subject for this harness. */
    open: z.array(openQuestionSchema).optional(),
    sources,
  })
  .strict()
  .refine((f) => f.observations.length > 0 || (f.open?.length ?? 0) > 0, {
    message: 'a fact needs at least one observation or one open question',
  })

/**
 * A reproducible run: `probes/<id>/probe.md`, with an optional `fixture/` folder beside it.
 * Its commands run from the probe folder, so every path in them is relative.
 */
export const probeSchema = z
  .object({
    type: z.literal(TYPE.probe),
    ...okfBase,
    /** The subjects a run answers. */
    subjects: z.array(subjectId).min(1),
    harnesses: z.array(id).min(1),
    /** Shell steps per harness, in order; every harness in `harnesses` has an entry. */
    commands: z.record(id, z.array(z.string().min(1)).min(1)),
    /** What to write down from a run. */
    record: z.array(z.string().min(1)).min(1),
    /** What a run touches beyond the probe folder, such as account-wide state. */
    safety: z.array(z.string().min(1)),
  })
  .strict()

/** The bundle-root index.md frontmatter (OKF v0.2 §12). */
export const rootIndexSchema = z.object({ okf_version: z.literal('0.2') }).strict()

export type Source = z.infer<typeof sourceSchema>
export type Observation = z.infer<typeof observationSchema>
export type OpenQuestion = z.infer<typeof openQuestionSchema>

export interface Category extends z.infer<typeof categorySchema> {
  id: string
}
export interface Subject extends z.infer<typeof subjectSchema> {
  id: string
  category: string
}
export interface Harness extends z.infer<typeof harnessSchema> {
  id: string
}
export interface Probe extends z.infer<typeof probeSchema> {
  id: string
  /** Whether `probes/<id>/fixture/` exists. */
  fixture: boolean
}
export interface Fact extends z.infer<typeof factSchema> {
  /** The OKF concept id: the path inside the bundle without `.md`. */
  conceptId: string
}

/** File name under schema/alpha/ for each JSON Schema the alpha corpus publishes. */
export const JSON_SCHEMAS = {
  'category.schema.json': categorySchema,
  'subject.schema.json': subjectSchema,
  'harness.schema.json': harnessSchema,
  'fact.schema.json': factSchema,
  'probe.schema.json': probeSchema,
} as const
