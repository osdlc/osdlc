/**
 * The `profiles` config section: named, ordered model preferences.
 *
 * The shape and the reference grammar are agent-router's. The one fact the
 * package cannot know is the host's vocabulary, so the host passes the names a
 * profile's `host` may take: this module imports none of the host's enums.
 * Whether each reference resolves against the layered catalogue needs the merged
 * `router` section, so that is the host's cross-field check, not this schema's.
 */

import { defineConfigSection } from '@osdlc/config-layers'

import { ProfilesConfigSchema, parseProfile } from '../profile.ts'

/**
 * What a host application supplies to mount the `profiles` section.
 *
 * @experimental
 */
export interface ProfilesSectionOptions {
  /** The names a profile's `host` may take. */
  readonly hostNames: readonly string[]
  /** The host's code paths that read the section, relative to its repository root. */
  readonly consumers: readonly string[]
  /** The key's description; defaults to a host-neutral one. */
  readonly description?: string
}

const DEFAULT_DESCRIPTION =
  "Named, ordered tool preferences. An entry is a bare list of references (`[claude/opus, codex/max]`, tried in order) or the long form `{order, host, context}`. A reference is `tool[/model][[qualifiers]][@effort]`, or `*` with a tier for every tool (`*/fast`). The section checks the shape: a reference that does not parse (an effort that is not a level from `none` to `max` included), a `context` that is not a size, or a `host` the host does not name fails the load and names the entry. Whether each tool, model and effort exists in the catalogue is the host's check, against the merged `router` section."

/**
 * Build the `profiles` config section, which holds named, ordered model preferences. Each profile
 * is validated with {@link parseProfile}, and its `host` must be one of the names the host
 * application supplies.
 *
 * @experimental
 */
export function profilesSection({
  hostNames,
  consumers,
  description = DEFAULT_DESCRIPTION,
}: ProfilesSectionOptions) {
  const schema = ProfilesConfigSchema.superRefine((profiles, ctx) => {
    for (const [name, config] of Object.entries(profiles)) {
      const parsed = parseProfile(config)
      if (!parsed.ok) {
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message: `profile '${name}': ${parsed.error.message}`,
        })
      } else if (parsed.value.host !== undefined && !hostNames.includes(parsed.value.host)) {
        ctx.addIssue({
          code: 'custom',
          path: [name, 'host'],
          message: `profile '${name}': host '${parsed.value.host}' is not one of ${hostNames.join(', ')}`,
        })
      }
    }
  })
  return defineConfigSection({
    key: 'profiles',
    schema: schema.optional().describe(description),
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
