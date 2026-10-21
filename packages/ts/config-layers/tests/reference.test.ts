/**
 * The generated reference page (`../src/reference.ts`), asserted against a small
 * synthetic schema: deterministic, one section and table row per key, nested
 * fields, collection defaults, and the cell escaping.
 */

import { describe, expect, test } from 'vitest'

import { z } from 'zod'

import type { ConfigKeyMeta } from '../src/meta.ts'
import { renderReference } from '../src/reference.ts'

import { vocabulary } from './support.ts'

const META: ConfigKeyMeta = {
  category: 'core',
  consumers: ['meta.ts#readConfigMeta'],
  layers: ['project'],
  applies_via: 'read',
  enforcement: 'soft',
  runs_in: ['cli'],
}

const SHAPE: Record<string, z.ZodType> = {
  docs_site: z.string().default('site').describe('Where the site lives.').meta(META),
  limits: z
    .object({
      implement: z.number().int().min(0).default(5).describe('Parallel jobs.'),
      inner: z
        .object({ deep: z.boolean().default(false).describe('Deep flag.') })
        .strict()
        .prefault({})
        .describe('An inner block.'),
    })
    .strict()
    .prefault({})
    .describe('Caps.')
    .meta({ ...META, category: 'extras' }),
}

const OPTS = {
  categories: vocabulary.spec.categories,
  preamble: ['---', 'title: ref', '---', '', '# Reference'],
  enforcementDoc: 'enf.md',
}

describe('renderReference', () => {
  const page = renderReference(SHAPE, OPTS)

  test('is deterministic and opens with the tool preamble', () => {
    expect(renderReference(SHAPE, OPTS)).toBe(page)
    expect(page.startsWith('---\ntitle: ref\n---\n\n# Reference\n\n## Keys\n')).toBe(true)
  })

  test('has one section per key and a keys-table row for each', () => {
    for (const key of Object.keys(SHAPE)) {
      expect(page).toContain(`\n### ${key}\n`)
      expect(page).toContain(`| [\`${key}\`](#${key})`)
    }
    expect(page).toContain('## Core')
    expect(page).toContain('## Extras')
  })

  test('renders nested fields, nested sections, a collection default and the enforcement link', () => {
    expect(page).toContain('| `implement` | `integer >= 0` | `5` | Parallel jobs. |')
    expect(page).toContain('`limits.inner`')
    expect(page).toContain('```yaml\nlimits:')
    expect(page).toContain('(see [the enforcement table](enf.md))')
  })
})

describe('table cell escaping', () => {
  const pageWith = (description: string): string =>
    renderReference(
      {
        limits: z
          .object({ n: z.number().default(1).describe(description) })
          .strict()
          .prefault({})
          .describe('Caps.')
          .meta(META),
      },
      OPTS,
    )

  test('escapes pipes and folds newlines', () => {
    expect(pageWith('a | b\n  c')).toContain('a \\| b c |')
  })

  test('a backslash before a pipe is escaped, so the pipe stays literal', () => {
    expect(pageWith('a\\|b')).toContain('a\\\\\\|b |')
  })
})

describe('renderReference — deprecation', () => {
  const dep = { since: '1.2.0', removeIn: '2.0.0', use: 'paths.site' }
  const shape: Record<string, z.ZodType> = {
    docs_site: z
      .string()
      .default('site')
      .describe('Where.')
      .meta({ ...META, deprecation: dep }),
    live: z.string().default('x').describe('Live.').meta(META),
  }

  test('a deprecated key gets a Deprecated row naming since, removal and replacement', () => {
    const page = renderReference(shape, OPTS)
    expect(page).toContain('| Deprecated | since 1.2.0, removed in 2.0.0; use `paths.site` |')
    expect(page.match(/\| Deprecated \|/g)).toHaveLength(1)
  })

  test('the row omits the replacement when there is none', () => {
    const page = renderReference(
      { docs_site: shape.docs_site!.meta({ ...META, deprecation: { since: '1', removeIn: '2' } }) },
      OPTS,
    )
    expect(page).toContain('| Deprecated | since 1, removed in 2 |')
  })
})
