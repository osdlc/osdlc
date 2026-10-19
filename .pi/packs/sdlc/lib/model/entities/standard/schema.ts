/**
 * Standard entity — Zod schema (mirror of `standard/schema.json`).
 *
 * Per [[T-JO4I-entity-zod-schemas-validation-ops-swap]]: `CommonFrontmatter`
 * base + Standard-specific fields including the required nested `applies_to`
 * object, `.strict()` for the JSON `additionalProperties: false` (applied to
 * both the top-level object and the nested `applies_to`), plus the two
 * state-conditional requireds (`closed/superseded ⇒ superseded_by`,
 * `closed/deprecated ⇒ deprecation_note`), shared with Decision as
 * `SUPERSESSION_RULES`.
 */

import { contract, lenientBody, optionalSection, section } from 'markdown-contract'
import { z } from 'zod'

import {
  CommonFrontmatter,
  DOC_WIKILINK_PATTERN,
  entityIdPattern,
  entityWikilinkPattern,
  requiredWhen,
  SUPERSESSION_RULES,
} from '../_common.ts'
import { titleMirrorsH1 } from '../_rules.ts'

/** Mirrors `standard/schema.json` `version`. */
export const SCHEMA_VERSION = '2'

/** Standard-shaped wikilink (slug optional). */
export const STANDARD_WIKILINK_PATTERN = entityWikilinkPattern('S')

/** How hard `verify changes` enforces a standard; shared with the verify provider that reads it raw. */
export const EnforcementField = z
  .enum(['advise', 'block'])
  .optional()
  .describe(
    "How hard `verify changes` enforces this standard. 'advise': its findings never " +
      "block, even when the project is blocking. 'block': they block at this standard's " +
      'own floor, even when the project is advisory. Absent: the project-wide ' +
      '`verify.blocking` and `verify.severity_floor` apply.',
  )

/** A standard's own blocking floor; only meaningful with `enforcement: block`. */
export const SeverityFloorField = z
  .enum(['violation', 'tension', 'drift'])
  .optional()
  .describe(
    "Lowest severity of this standard's findings that blocks. Only with " +
      "`enforcement: block`; when absent the project's `verify.severity_floor` applies.",
  )

export const StandardSchema = CommonFrontmatter.extend({
  type: z.literal('standard').describe('Dispatch tag for the validator framework.'),
  id: z
    .string()
    .regex(entityIdPattern('S'))
    .describe(
      'Immutable identifier in canonical S-NNNN shape per ' +
        "[[D-0002-entity-identifier-shape]]: 'S-' + 4 zero-padded chars [0-9A-Z] " +
        '(Standards use incrementing numbering). Never renamed once assigned.',
    ),
  state: z
    .enum(['open/draft', 'open/proposed', 'open/active', 'closed/superseded', 'closed/deprecated'])
    .default('open/proposed')
    .describe(
      'Lifecycle stage. open/* states are active; closed/* are terminal. ' +
        'Standards move from open/draft → open/proposed → open/active; ' +
        'closed/superseded means a newer Standard replaces this one; ' +
        'closed/deprecated means the rule no longer applies.',
    ),
  applies_to: z
    .object({
      paths: z
        .array(z.string().min(1))
        .min(1)
        .refine((arr) => new Set(arr).size === arr.length, {
          message: 'paths entries must be unique',
        }),
    })
    .strict()
    .describe(
      'Scope of the rule. Required. `paths` is a list of glob patterns naming ' +
        'where the rule binds.',
    ),
  supersedes: z
    .string()
    .regex(STANDARD_WIKILINK_PATTERN)
    .optional()
    .describe(
      'Wikilink to the Standard this one replaces, if any. Slug is optional per ' +
        '[[D-0002-entity-identifier-shape]].',
    ),
  superseded_by: z
    .string()
    .regex(STANDARD_WIKILINK_PATTERN)
    .optional()
    .describe(
      'Wikilink to the Standard that replaces this one, if any. Required when ' +
        'state is closed/superseded. Slug is optional per ' +
        '[[D-0002-entity-identifier-shape]].',
    ),
  enforcement: EnforcementField,
  severity_floor: SeverityFloorField,
  related: z
    .array(z.string().regex(DOC_WIKILINK_PATTERN))
    .default([])
    .describe(
      'Cross-references. Entries are wikilinks — typically to other entities by ' +
        'id (slug optional per [[D-0002-entity-identifier-shape]]), but may also ' +
        'reference non-entity planning docs by their wikilink slug.',
    ),
  deprecation_note: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Short note on why the standard was deprecated. Required when state is ' + 'deprecated.',
    ),
})
  .strict()
  .superRefine((fm, ctx) => {
    // allOf if/then: a superseded Standard must point at its replacement, and a
    // deprecated one must explain why — the same rule pair Decision carries.
    const fields = fm as Record<string, unknown>
    for (const rule of SUPERSESSION_RULES) {
      requiredWhen(ctx, fm.state === rule.state && fields[rule.field] === undefined, rule.field)
    }
    // A floor only means something on a blocking standard.
    if (fm.severity_floor !== undefined && fm.enforcement !== 'block') {
      ctx.addIssue({
        code: 'custom',
        path: ['severity_floor'],
        message: "severity_floor requires enforcement: 'block'",
      })
    }
  })

export type Standard = z.infer<typeof StandardSchema>

/**
 * The Standard contract — `StandardSchema` as the frontmatter plane plus the
 * body grammar from the manifest (order: lenient → `"none"`, `allowUnknown`).
 * The required core (Rule / Why / How to apply) and Anti-examples carry aliases.
 */
export const StandardContract = contract({
  frontmatter: StandardSchema,
  rules: [titleMirrorsH1],
  body: lenientBody([
    section('Summary'),
    section(['Rule', 'Standard', 'Statement']),
    section(['Why', 'Rationale']),
    section(['How to apply', 'Application', 'How this applies']),
    optionalSection(['Anti-examples', 'Counter-examples', 'Violations']),
    optionalSection('Scope'),
    optionalSection('Notes'),
    optionalSection('References'),
  ]),
})
