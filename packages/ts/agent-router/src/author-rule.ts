import { z } from 'zod'

/**
 * What the author rule does when only the author's tool is left: `different-model`, `wait` or
 * `person`. The rule's config keys ({@link authorRuleFields}) are carried by a caller whose work
 * has an author, such as a code review, beside its binding. A profile does not hold them.
 */
export const IfOnlyAuthorLeftSchema = z.enum(['different-model', 'wait', 'person'])

/** One of the {@link IfOnlyAuthorLeftSchema} values. */
export type IfOnlyAuthorLeft = z.infer<typeof IfOnlyAuthorLeftSchema>

/**
 * The author rule's config keys as zod fields, `not_the_author` and `if_only_author_left`, for a
 * caller to spread into its own schema.
 */
export const authorRuleFields = {
  not_the_author: z
    .boolean()
    .optional()
    .describe(
      "Set aside every entry on the author's tool; with the author unknown, every entry. Default false.",
    ),
  if_only_author_left: IfOnlyAuthorLeftSchema.optional().describe(
    "When only the author's tool is left: `different-model` (default) takes an entry whose model differs, `wait` stops, `person` hands the work to a person.",
  ),
}

/** The author rule as the walk takes it (`ChooseContext.authorRule`). */
export type AuthorRule = { notTheAuthor: boolean; ifOnlyAuthorLeft: IfOnlyAuthorLeft }

/** The rule the config keys ask for: `not_the_author` false and `different-model` when unset. */
export function authorRule(config: {
  not_the_author?: boolean | undefined
  if_only_author_left?: IfOnlyAuthorLeft | undefined
}): AuthorRule {
  return {
    notTheAuthor: config.not_the_author ?? false,
    ifOnlyAuthorLeft: config.if_only_author_left ?? 'different-model',
  }
}
