/**
 * Deprecated config keys. A section whose meta carries `deprecation:`
 * (`./meta.ts`) stays in the schema and loads normally; the loader warns on
 * stderr, once per key per handle, and the run goes on. Only a key that is NOT
 * in the schema is refused, so removing a deprecated key is a separate, later
 * change. The library carries the notice; which keys are deprecated is the
 * tool's call, made in its section metas.
 */

import type { ConfigSection } from './section.ts'
import type { Deprecation } from './meta.ts'

/**
 * A deprecated top-level key that a layer file sets.
 *
 * @experimental
 */
export interface DeprecatedKeyUse {
  key: string
  deprecated: Deprecation
  /** The index in `layers` of the first layer that sets it. */
  layer: number
}

/**
 * Every deprecated section whose key is set in any of `layers` (raw mappings,
 * `null` for an absent layer), in section order, each with the first layer that
 * sets it. Judged on the raw files, not the merged result, so a key that merely
 * has a default is never reported.
 * @experimental
 */
export function deprecatedKeysSet(
  sections: readonly Pick<ConfigSection, 'key' | 'meta'>[],
  layers: readonly (Record<string, unknown> | null)[],
): DeprecatedKeyUse[] {
  const out: DeprecatedKeyUse[] = []
  for (const { key, meta } of sections) {
    if (meta.deprecation === undefined) continue
    const layer = layers.findIndex((l) => l !== null && key in l)
    if (layer >= 0) out.push({ key, deprecated: meta.deprecation, layer })
  }
  return out
}

/**
 * One warning line (no newline) for a deprecated key or command; `subject` is what is deprecated.
 *
 * @experimental
 */
export function deprecationMessage(subject: string, d: Deprecation): string {
  const use = d.use !== undefined ? `; use ${d.use} instead` : ''
  return `warning: ${subject} is deprecated since ${d.since} and will be removed in ${d.removeIn}${use}`
}
