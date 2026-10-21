/**
 * The `code_host` config section: which adapter `selectCodeHost` picks. The
 * package owns the section; a host CLI mounts it in its config file.
 */

import { z } from 'zod'

import { defineConfigSection } from '@osdlc/config-layers'

export const codeHostSection = defineConfigSection({
  key: 'code_host',
  schema: z
    .object({
      override: z
        .enum(['github', 'forgejo'])
        .nullable()
        .default(null)
        .describe(
          "Force which CodeHost adapter `selectCodeHost`'s callers use, bypassing auto-detection from the `origin` remote's URL. Null (the default) auto-detects: a `github.com` remote uses the GitHub adapter, anything else uses Forgejo.",
        ),
    })
    .strict()
    .prefault({})
    .describe(
      'Which code host the PR commands of the host CLI talk to, via `selectCodeHost`. Every key has a default, so this block is optional.',
    ),
  meta: {
    category: 'integration',
    consumers: ['src/select.ts#selectCodeHost'],
    layers: ['project', 'local'],
    applies_via: 'read',
    enforcement: 'read',
    runs_in: ['cli', 'loop'],
  },
})
