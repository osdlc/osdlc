/**
 * The `routing` config section: rules that pick a profile from a launch's
 * workflow and its task's attributes, first match wins.
 *
 * The shape is agent-router's. The closed sets a rule's `when` values come from
 * (chain stages, task enums) are the host's, so the host passes them in as a
 * {@link RoutingSectionVocabulary} and this module imports none of them. Whether each
 * rule's `profile` is defined needs the merged `profiles` section, so that is the
 * host's cross-field check, not this schema's.
 */

import { defineConfigSection } from '@osdlc/config-layers'

import { RoutingConfigSchema, parseRouting } from '../routing.ts'
import type { RoutingVocabulary } from '../routing.ts'

/**
 * The closed sets the host supplies for the `stage`, `complexity`, `impact` and `autonomy` keys of
 * a rule's `when`.
 *
 * @experimental
 */
export type RoutingSectionVocabulary = Required<
  Pick<RoutingVocabulary, 'stage' | 'complexity' | 'impact' | 'autonomy'>
>

/**
 * What a host application supplies to mount `routing`, besides the closed sets.
 *
 * @experimental
 */
export interface RoutingSectionOptions {
  /** The host's code paths that read the section, relative to its repository root. */
  readonly consumers: readonly string[]
  /** The key's description, given the vocabulary; defaults to a host-neutral one quoting it. */
  readonly describe?: (vocabulary: RoutingSectionVocabulary) => string
}

function defaultDescribe(vocabulary: RoutingSectionVocabulary): string {
  return (
    'Rules that choose a profile from what a launch is for, tried in order; the first whose `when` holds wins. Each rule is `{when, profile}`. `when` keys: `workflow`, `stage` (' +
    vocabulary.stage.join(' | ') +
    '), `complexity` (' +
    vocabulary.complexity.join(' | ') +
    '), `impact` (' +
    vocabulary.impact.join(' | ') +
    '), `autonomy` (' +
    vocabulary.autonomy.join(' | ') +
    ') and `tags` (a list; holds when the task carries any of them). Every key a rule sets must hold. A rule naming an unknown `when` key or a value outside its set fails the load and names the rule index.'
  )
}

/**
 * Build the `routing` config section: ordered rules that pick a profile from a launch's workflow
 * and its task's attributes. A `when` value outside the supplied vocabulary fails the load and
 * names the rule.
 *
 * @experimental
 */
export function routingSection(
  vocabulary: RoutingSectionVocabulary,
  { consumers, describe = defaultDescribe }: RoutingSectionOptions,
) {
  const schema = RoutingConfigSchema.superRefine((rules, ctx) => {
    const parsed = parseRouting(rules, vocabulary)
    if (!parsed.ok && parsed.error.kind === 'invalid-value') {
      ctx.addIssue({
        code: 'custom',
        path: [parsed.error.index, 'when', parsed.error.key],
        message: parsed.error.message,
      })
    }
  })
  return defineConfigSection({
    key: 'routing',
    schema: schema.optional().describe(describe(vocabulary)),
    meta: {
      category: 'integration',
      consumers: [...consumers],
      layers: ['project', 'local'],
      applies_via: 'read',
      enforcement: 'read',
      runs_in: ['cli', 'loop'],
    },
  })
}
