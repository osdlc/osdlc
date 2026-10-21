/**
 * Generic deep-merge for two parsed YAML mappings — the primitive behind the
 * project-file overlay (`tooly.local.yaml` for a tool named `tooly`).
 *
 * `deepMergeConfig(base, overlay)` merges `overlay` over `base`: a key whose
 * value is a mapping on BOTH sides merges recursively (so `tooly.local.yaml`
 * can override one nested key — say `workflows.check` — without repeating
 * every sibling key `tooly.yaml` already declares); every other value (an
 * array, a scalar, or a mapping on only one side) REPLACES the base value
 * wholesale. Arrays never concatenate: a `workflows.setup:` list in the
 * overlay is the whole list, not an addition to the project's. The one
 * exception is the top-level `schedules:` list, which merges by entry `name`
 * (see `mergeByName`).
 *
 * Pure, and schema-agnostic apart from that one hard-coded `schedules` key — it
 * merges raw `unknown` mappings BEFORE either side is validated, so one schema `safeParse`
 * downstream covers both files at once.
 */

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Deep-merge `overlay` over `base`. Neither argument is mutated. A key
 * present in `overlay` whose value and the corresponding `base` value are
 * both mappings merges recursively; otherwise the overlay's value wins
 * outright (this is also how a `null`/scalar/array overlay value clears or
 * replaces a mapping in `base`).
 * @experimental
 */
export function deepMergeConfig(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const out = mergeMappings(base, overlay)
  const baseList = base['schedules']
  const overlayList = overlay['schedules']
  if (Array.isArray(baseList) && Array.isArray(overlayList)) {
    out['schedules'] = mergeByName(baseList, overlayList)
  }
  return out
}

/**
 * Merge two lists of named entries by `name`: an overlay entry replaces the
 * base entry of the same name whole, a new name is appended, and a base entry
 * the overlay does not name is kept. Duplicates inside one list are kept as
 * written, so validation can still refuse them.
 */
function mergeByName(base: unknown[], overlay: unknown[]): unknown[] {
  const nameOf = (entry: unknown): unknown => (isRecord(entry) ? entry['name'] : undefined)
  const overlaid = new Set(
    overlay.flatMap((e) => {
      const n = nameOf(e)
      return typeof n === 'string' ? [n] : []
    }),
  )
  return [
    ...base.filter((e) => {
      const n = nameOf(e)
      return typeof n !== 'string' || !overlaid.has(n)
    }),
    ...overlay,
  ]
}

function mergeMappings(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const [key, overlayValue] of Object.entries(overlay)) {
    const baseValue = out[key]
    out[key] =
      isRecord(baseValue) && isRecord(overlayValue)
        ? mergeMappings(baseValue, overlayValue)
        : overlayValue
  }
  return out
}
