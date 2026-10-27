/**
 * Deep merge of two parsed YAML mappings. The project-file overlay
 * (`tooly.local.yaml` for a tool named `tooly`) is applied with it.
 *
 * `deepMergeConfig(base, overlay)` merges `overlay` over `base`. A key whose
 * value is a mapping on both sides merges recursively. So `tooly.local.yaml`
 * can override one nested key, such as `workflows.check`, without repeating
 * every sibling key `tooly.yaml` declares. Every other value (an array, a
 * scalar, or a mapping on only one side) replaces the base value whole.
 * Arrays never concatenate: a `workflows.setup:` list in the overlay is the
 * whole list, not an addition to the project's. The one exception is the
 * top-level `schedules:` list, which merges by entry `name` (see
 * `mergeByName`).
 *
 * The function is pure. It knows no schema apart from the hard-coded
 * `schedules` key. It merges raw mappings before either side is validated, so
 * one schema `safeParse` afterwards covers both files.
 */

import { isPlainObject } from './value.ts'

/**
 * Deep-merge `overlay` over `base`. Neither argument is mutated. When a key's
 * value is a mapping in both, the two merge recursively. Otherwise the
 * overlay's value wins, so a `null`, scalar or array in the overlay clears or
 * replaces a mapping in `base`. A top-level `schedules:` list in both merges
 * by entry `name`.
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
  const nameOf = (entry: unknown): unknown => (isPlainObject(entry) ? entry['name'] : undefined)
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
      isPlainObject(baseValue) && isPlainObject(overlayValue)
        ? mergeMappings(baseValue, overlayValue)
        : overlayValue
  }
  return out
}
