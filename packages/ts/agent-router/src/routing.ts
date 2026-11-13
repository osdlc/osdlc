import { z } from 'zod'
import { err, ok, type Result } from '@osdlc/result'
import { deepFreeze } from './freeze.ts'

/** The request attributes a rule's `when` may test, in display order. */
export const ROUTING_KEYS = deepFreeze([
  'workflow',
  'stage',
  'complexity',
  'impact',
  'autonomy',
  'tags',
] as const)
/** One of the request attributes a rule's `when` may test, the {@link ROUTING_KEYS}. */
export type RoutingKey = (typeof ROUTING_KEYS)[number]

const Value = z.string().trim().min(1)

/** All keys present must match; `tags` matches when the request carries any listed tag. */
export const RoutingWhenSchema = z.strictObject({
  workflow: Value.optional(),
  stage: Value.optional(),
  complexity: Value.optional(),
  impact: Value.optional(),
  autonomy: Value.optional(),
  tags: z.array(Value).min(1).optional(),
})

export const RoutingRuleSchema = z.strictObject({
  when: RoutingWhenSchema,
  /** The profile a matching request resolves through. */
  profile: Value,
})

/** Schema for a `routing:` section: an ordered list of strict `{when, profile}` rules. */
export const RoutingConfigSchema = z.array(RoutingRuleSchema)

/** A parsed {@link RoutingWhenSchema}. */
export type RoutingWhen = z.infer<typeof RoutingWhenSchema>
/**
 * A routing rule: the `when` conditions and the name of the `profile` a matching request resolves
 * through.
 */
export type RoutingRule = z.infer<typeof RoutingRuleSchema>

/** What one launch is for: the workflow, and the attributes of the task it runs on when it has one. */
export type RouteRequest = {
  workflow?: string | undefined
  stage?: string | undefined
  complexity?: string | undefined
  impact?: string | undefined
  autonomy?: string | undefined
  tags?: readonly string[] | undefined
}

/**
 * The values a key may hold, when the caller has a closed set (a task's
 * `complexity`, say). A key left out takes any non-empty string.
 */
export type RoutingVocabulary = Partial<Record<RoutingKey, readonly string[]>>

/**
 * Why a `routing:` section did not parse: the wrong shape, or a `when` value outside the caller's
 * vocabulary (with the rule `index`, the `key` and the valid values).
 */
export type RoutingError =
  | { kind: 'invalid-shape'; index?: number; message: string }
  | {
      kind: 'invalid-value'
      index: number
      key: RoutingKey
      value: string
      valid: readonly string[]
      message: string
    }

function issuePath(path: readonly PropertyKey[]): string {
  const [index, ...rest] = path
  const head = typeof index === 'number' ? `routing[${index}]` : 'routing'
  return rest.length > 0 ? `${head}: ${rest.map(String).join('.')}` : head
}

/**
 * Parse a `routing:` section: an ordered list of `{when, profile}` rules.
 * With `vocabulary`, a `when` value outside its key's set is an error naming
 * the rule index and the valid values. Whether `profile` names a defined
 * profile is the caller's check: profiles may be defined elsewhere.
 */
export function parseRouting(
  input: unknown,
  vocabulary: RoutingVocabulary = {},
): Result<RoutingRule[], RoutingError> {
  const parsed = RoutingConfigSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const index = typeof issue?.path[0] === 'number' ? issue.path[0] : undefined
    return err({
      kind: 'invalid-shape',
      ...(index !== undefined ? { index } : {}),
      message: parsed.error.issues.map((i) => `${issuePath(i.path)}: ${i.message}`).join('; '),
    })
  }
  for (const [index, rule] of parsed.data.entries()) {
    for (const key of ROUTING_KEYS) {
      const valid = vocabulary[key]
      const raw = rule.when[key]
      if (valid === undefined || raw === undefined) continue
      for (const value of typeof raw === 'string' ? [raw] : raw) {
        if (valid.includes(value)) continue
        return err({
          kind: 'invalid-value',
          index,
          key,
          value,
          valid,
          message: `routing[${index}]: when.${key}: '${value}' is not one of ${valid.join(', ')}`,
        })
      }
    }
  }
  return ok(parsed.data)
}

/** Whether every key of `when` holds for `request`. A key the request lacks does not hold. */
function holds(when: RoutingWhen, request: RouteRequest): boolean {
  for (const key of ROUTING_KEYS) {
    if (key === 'tags') {
      if (when.tags !== undefined && !(request.tags ?? []).some((t) => when.tags!.includes(t))) {
        return false
      }
    } else if (when[key] !== undefined && request[key] !== when[key]) {
      return false
    }
  }
  return true
}

/** The first rule whose `when` holds for `request`, with its index; `undefined` when none does. */
export function matchRule(
  rules: readonly RoutingRule[],
  request: RouteRequest,
): { index: number; rule: RoutingRule } | undefined {
  const index = rules.findIndex((rule) => holds(rule.when, request))
  return index === -1 ? undefined : { index, rule: rules[index]! }
}

/**
 * Whether every request `narrow` matches, `broad` matches too: each key of
 * `broad` is in `narrow` with the same value, and for `tags`, every tag
 * `narrow` lists is one `broad` lists.
 */
function covers(broad: RoutingWhen, narrow: RoutingWhen): boolean {
  for (const key of ROUTING_KEYS) {
    if (key === 'tags') {
      if (broad.tags === undefined) continue
      if (narrow.tags === undefined || !narrow.tags.every((t) => broad.tags!.includes(t))) {
        return false
      }
    } else if (broad[key] !== undefined && narrow[key] !== broad[key]) {
      return false
    }
  }
  return true
}

/**
 * The rules that can never match because an earlier rule with the same or a
 * broader `when` matches every request they do: each with the first such
 * earlier rule's index.
 */
export function shadowedRules(rules: readonly RoutingRule[]): { index: number; by: number }[] {
  const out: { index: number; by: number }[] = []
  for (const [index, rule] of rules.entries()) {
    const by = rules.slice(0, index).findIndex((earlier) => covers(earlier.when, rule.when))
    if (by !== -1) out.push({ index, by })
  }
  return out
}

/** `{workflow: implement, complexity: small, tags: [ui]}`: a `when` as the config writes it. */
export function formatWhen(when: RoutingWhen): string {
  const parts = ROUTING_KEYS.flatMap((key) => {
    const value = when[key]
    if (value === undefined) return []
    return [`${key}: ${typeof value === 'string' ? value : `[${value.join(', ')}]`}`]
  })
  return `{${parts.join(', ')}}`
}
