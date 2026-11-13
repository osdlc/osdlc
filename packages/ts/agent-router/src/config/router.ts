/**
 * The `router` config section: the model catalogue's facts and mapping policy.
 * The shape is the whole check.
 */

import { defineConfigSection, type Stability } from '@osdlc/config-layers'

import { RouterConfigSchema } from '../catalogue/schema.ts'

/**
 * What a host application supplies to mount `router`.
 *
 * @experimental
 */
export interface RouterSectionOptions {
  /** The host's code paths that read the section, relative to its repository root. */
  readonly consumers: readonly string[]
  /** The key's description; defaults to a host-neutral one. */
  readonly description?: string
  /** Whether the host's compatibility promise covers the key; absent is `stable`. */
  readonly stability?: Stability
}

const DEFAULT_DESCRIPTION =
  'Model catalogue facts layered over the snapshot `@osdlc/agent-router` ships: `providers` (`{kind, endpoint, key_env}`; `key_env` names an environment variable, never a key), `tools`, `offerings` (rows that add one tool and model combination, or remove one with `remove: true`), `strict` (default false: an unknown model only warns; true refuses the load), and the mapping policy: `classify`, `chains.order` and `pins`. Unknown keys, an incomplete new tool or provider, a row naming an unknown tool, provider or model, and a pin its tool cannot run fail the load. A `remove: true` row for an unknown model only warns, unless `strict` is true.'

/**
 * Build the `router` config section, which holds the model catalogue's facts and mapping policy;
 * its shape is {@link RouterConfigSchema}.
 *
 * @experimental
 */
export function routerSection({
  consumers,
  description = DEFAULT_DESCRIPTION,
  stability,
}: RouterSectionOptions) {
  return defineConfigSection({
    key: 'router',
    schema: RouterConfigSchema.optional().describe(description),
    meta: {
      ...(stability !== undefined ? { stability } : {}),
      category: 'integration',
      consumers: [...consumers],
      layers: ['project', 'local'],
      applies_via: 'read',
      enforcement: 'read',
      runs_in: ['cli', 'loop'],
    },
  })
}
