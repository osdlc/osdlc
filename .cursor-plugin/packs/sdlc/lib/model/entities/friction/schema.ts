/**
 * Friction entity — Zod schema ([[D-J7RN-agent-logging]], "The `friction` entity").
 *
 * A Friction is a recorded, deduplicated observation that the process cost time
 * or failed, with a path to becoming a task. Two sources: `reported` (an agent
 * or person, from a post-mortem) and `detected` (a deterministic read of the
 * journal and activity logs, `services/friction/detect.ts`).
 *
 * The entity is committed while the log root is gitignored by default, so a
 * Friction stands alone: ids, counts, fingerprints and fixed labels (op, tool,
 * workflow and step names, error classes). Never prompt, message, argument or
 * output text, and never a pointer that only resolves on one machine.
 *
 * `CommonFrontmatter` base + Friction-specific fields, `.strict()`, plus the
 * source- and state-conditional rules in one `.superRefine`:
 *
 *   - `source: detected` ⇒ `signal`, `fingerprint`, `first_seen`, `last_seen`
 *     are required; `source: reported` ⇒ `signal` is absent;
 *   - `closed/promoted`  ⇒ `result` is required and is a task or backlog wikilink;
 *   - `closed/resolved`  ⇒ `result` is required (a freeform note of what fixed it);
 *   - `closed/dismissed` and every `open/*` state ⇒ `result` is absent.
 */

import { contract, lenientBody, optionalSection, section } from 'markdown-contract'
import { z } from 'zod'

import {
  CommonFrontmatter,
  DOC_WIKILINK_PATTERN,
  ENTITY_WIKILINK_PATTERN,
  entityIdPattern,
  entityWikilinkPattern,
  requiredWhen,
} from '../_common.ts'
import { titleMirrorsH1 } from '../_rules.ts'

export const SCHEMA_VERSION = '1'

export const FRICTION_STATES = [
  'open/detected',
  'open/accepted',
  'closed/promoted',
  'closed/dismissed',
  'closed/resolved',
] as const

export const FRICTION_SOURCES = ['detected', 'reported'] as const

/** The detectors in `services/friction/detect.ts`, one per signal. */
export const FRICTION_SIGNALS = [
  'tool-failure-repeat',
  'permission-wait',
  'compaction',
  'stall',
  'op-error',
  'op-retry',
  'dispatch-fallback',
  'model-switch',
  'session-lost',
  'step-failure',
] as const
export type FrictionSignal = (typeof FRICTION_SIGNALS)[number]

export const FRICTION_SCOPES = ['local', 'upstream', 'external'] as const

/** `promoted` points at the artifact the friction became. */
export const RESULT_PROMOTED_PATTERN = entityWikilinkPattern(['T', 'B'])

/** A non-negative integer as a string: the house frontmatter writes no bare numbers. */
export const COUNT_PATTERN = /^(0|[1-9][0-9]*)$/

/**
 * The dedupe key: the signal, then fixed-label segments (op, tool, workflow,
 * step, error class) joined by `|`. A segment is a restricted charset, so no
 * free text can ride in it.
 */
export const FINGERPRINT_PATTERN = /^[a-z][a-z0-9-]*(\|[A-Za-z0-9._:@/+=-]{1,64})*$/

export const FrictionSchema = CommonFrontmatter.extend({
  type: z.literal('friction').describe('Dispatch tag for the validator framework.'),
  id: z
    .string()
    .regex(entityIdPattern('FR'))
    .describe(
      "Immutable identifier per [[D-0002-entity-identifier-shape]]: 'FR-' + 4 " +
        'base-36 chars [0-9A-Z]. Matches the filename; never renamed once assigned.',
    ),
  state: z
    .enum(FRICTION_STATES)
    .default('open/detected')
    .describe(
      'Lifecycle stage. open/detected: surfaced and not yet triaged (the default); ' +
        'open/accepted: triaged as worth acting on; closed/promoted: became a task or ' +
        'backlog item (`result` names it); closed/dismissed: not worth acting on; ' +
        'closed/resolved: fixed without a task (`result` says how). A closed friction ' +
        'that recurs is reopened to open/detected by `friction detect --apply`.',
    ),
  source: z
    .enum(FRICTION_SOURCES)
    .describe(
      'detected: a deterministic read of the journal and activity logs. reported: ' +
        'an agent or person wrote it, from a post-mortem.',
    ),
  signal: z
    .enum(FRICTION_SIGNALS)
    .optional()
    .describe('The detector that fired. Required when `source` is detected; absent otherwise.'),
  fingerprint: z
    .string()
    .regex(FINGERPRINT_PATTERN)
    .optional()
    .describe(
      'The dedupe key: the signal plus fixed-label segments (op or tool name, ' +
        'error class) joined by `|`. Required when `source` is detected.',
    ),
  scope: z
    .enum(FRICTION_SCOPES)
    .default('local')
    .describe(
      'Where the fix belongs: local (this repo), upstream (a plugin or library this ' +
        'repo consumes), external (another project or a service). The post-mortem ' +
        'classification.',
    ),
  occurrences: z
    .string()
    .regex(COUNT_PATTERN)
    .refine((n) => n !== '0', 'occurrences is at least 1')
    .default('1')
    .describe(
      'Event count behind the observation (the most any one scan has seen), a numeric ' +
        'string like `schema_version`: frontmatter is written without bare numbers.',
    ),
  runs: z
    .string()
    .regex(COUNT_PATTERN)
    .default('0')
    .describe(
      'Distinct runs the events came from, a numeric string; `0` for a report that names none.',
    ),
  first_seen: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe('RFC 3339 instant of the earliest event. Required when `source` is detected.'),
  last_seen: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe('RFC 3339 instant of the latest event. Required when `source` is detected.'),
  subjects: z
    .array(z.string().regex(ENTITY_WIKILINK_PATTERN))
    .default([])
    .describe(
      'Wikilinks to the tasks the evidence touched. A PR has no entity id and is not listed.',
    ),
  result: z
    .string()
    .min(1)
    .optional()
    .describe(
      'What the friction became: a task or backlog wikilink for closed/promoted, a ' +
        'short note of the fix for closed/resolved. Absent in every other state.',
    ),
  related: z
    .array(z.string().regex(DOC_WIKILINK_PATTERN))
    .default([])
    .describe(
      'Cross-references. Entries are wikilinks — typically to entities by id (slug ' +
        'optional per [[D-0002-entity-identifier-shape]]). A friction never carries ' +
        '`depends_on`: it is evidence, not work.',
    ),
})
  .strict()
  .superRefine((fm, ctx) => {
    const detected = fm.source === 'detected'
    requiredWhen(ctx, detected && fm.signal === undefined, 'signal')
    requiredWhen(ctx, detected && fm.fingerprint === undefined, 'fingerprint')
    requiredWhen(ctx, detected && fm.first_seen === undefined, 'first_seen')
    requiredWhen(ctx, detected && fm.last_seen === undefined, 'last_seen')
    if (!detected && fm.signal !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['signal'],
        message: "'signal' belongs to detected friction only; a reported friction carries none",
      })
    }

    const { state, result } = fm
    requiredWhen(
      ctx,
      (state === 'closed/promoted' || state === 'closed/resolved') && result === undefined,
      'result',
    )
    if (state === 'closed/promoted' && result !== undefined) {
      if (!RESULT_PROMOTED_PATTERN.test(result)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['result'],
          message: `'${result}' does not match '${RESULT_PROMOTED_PATTERN.source}'`,
        })
      }
    }
    if ((state === 'closed/dismissed' || state.startsWith('open/')) && result !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['result'],
        message: `${state} must not carry a \`result:\` — there is nothing to point at`,
      })
    }
  })

export type Friction = z.infer<typeof FrictionSchema>

/** The Friction contract — the frontmatter plus the template's H2 sections; `Proposal` is optional. */
export const FrictionContract = contract({
  frontmatter: FrictionSchema,
  rules: [titleMirrorsH1],
  body: lenientBody([section('Observation'), section('Evidence'), optionalSection('Proposal')]),
})
