/**
 * Even-split grouping: the rule that turns one oversized list into slices of
 * at most `limit` items, spread evenly.
 *
 * This is the same rule as `shardFiles` in `@osdlc/rule-review`'s `src/plan.ts`,
 * which does not export it, so diffkit keeps its own copy. It is not exported
 * from the package root. If one rule changes, change both.
 */

/**
 * Consecutive slices of `items`, each at most `limit` long. `limit <= 0`
 * disables splitting. Spread evenly rather than filled to the limit, so five
 * items over a limit of four become 3+2 and not 4+1: count = ceil(n / limit),
 * and the first n % count slices take one item more than floor(n / count), so
 * no two slices differ by more than one (13 over 4 is 4+3+3+3).
 */
export function splitEven<T>(items: readonly T[], limit: number): T[][] {
  if (limit <= 0 || items.length <= limit) return [[...items]]
  const count = Math.ceil(items.length / limit)
  const base = Math.floor(items.length / count)
  const extra = items.length % count
  const slices: T[][] = []
  let at = 0
  for (let i = 0; i < count; i += 1) {
    const size = base + (i < extra ? 1 : 0)
    slices.push(items.slice(at, at + size))
    at += size
  }
  return slices
}
