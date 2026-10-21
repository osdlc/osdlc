/**
 * The generated config reference: a markdown page projected from a tool's Zod
 * config schema and its per-key `.meta()`,
 * gated for drift by the tool's own docs generation.
 *
 * Generic over the schema: it walks whatever top-level keys the schema
 * declares (grouped by meta `category` in the tool's category order, in
 * schema order within a category)
 * and recurses into object-valued fields, so a new or changed key changes
 * the page on the next regeneration with no edit here. Deterministic: no
 * timestamps, no environment reads, the same bytes for the same schema. The
 * tool supplies the page's front matter and prose preamble.
 */

import { escapeCell } from '@osdlc/gfm-table'
import { stringify } from 'yaml'
import type { z } from 'zod'

import { defaultOf, describeShape, nestedFields, resolveKeyPath, topLevelKeys } from './explain.ts'
import type { NestedField } from './explain.ts'
import { assertKnownCategories, isReserved } from './meta.ts'

/**
 * What the tool contributes to the page.
 *
 * @experimental
 */
export interface ReferenceOptions {
  /**
   * The tool's categories, in page order. Every key's category must be one of
   * them (a vocabulary's `spec.categories`, `./vocabulary.ts`).
   */
  categories: readonly string[]
  /**
   * The page up to (not including) the `## Keys` heading: front matter, title,
   * and the prose that explains the file and the meta columns.
   */
  preamble: readonly string[]
  /** The link target the Enforcement row points at, e.g. `enforcement.md`. */
  enforcementDoc: string
}

/** The house YAML emission for a default shown in the page: insertion order, no folding, single quotes. */
function dumpValue(value: unknown): string {
  return stringify(value, { sortMapEntries: false, lineWidth: 0, singleQuote: true })
}

/** Markdown's deepest heading level; deeper nested sections reuse it. */
const MAX_HEADING = 6

/**
 * Escape a string for a markdown table cell.
 *
 * @experimental
 */
function cell(text: string): string {
  return escapeCell(text.replace(/\s*\n\s*/g, ' '))
}

/** An inline-code span that survives backticks inside the value. */
function code(text: string): string {
  return text.includes('`') ? `\`\` ${text} \`\`` : `\`${text}\``
}

/** A default for a table cell: inline JSON, or `—` when there is none. */
function inlineDefault(value: unknown): string {
  return value === undefined ? '—' : code(JSON.stringify(value))
}

function isCollection(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.keys(value as Record<string, unknown>).length > 0
  )
}

function fieldsTable(fields: NestedField[]): string[] {
  const lines = ['| Field | Shape | Default | Description |', '|---|---|---|---|']
  for (const f of fields) {
    lines.push(
      `| ${code(f.name)} | ${cell(code(f.shape))} | ${cell(inlineDefault(f.default))} | ${cell(f.description) || '—'} |`,
    )
  }
  return lines
}

/** Sections for the object-valued children of `path`, recursively (each titled by its dotted path). */
function nestedSections(shape: Record<string, z.ZodType>, path: string[], level: number): string[] {
  const out: string[] = []
  for (const f of nestedFields(resolveKeyPath(shape, path).schema)) {
    const childPath = [...path, f.name]
    const children = nestedFields(resolveKeyPath(shape, childPath).schema)
    if (children.length === 0) continue
    out.push('', `${'#'.repeat(Math.min(level, MAX_HEADING))} ${code(childPath.join('.'))}`, '')
    if (f.description !== '') out.push(f.description, '')
    out.push(...fieldsTable(children))
    out.push(...nestedSections(shape, childPath, level + 1))
  }
  return out
}

/**
 * Render the whole reference page for the schema whose top-level fields are `shape`.
 *
 * @experimental
 */
export function renderReference(shape: Record<string, z.ZodType>, opts: ReferenceOptions): string {
  const metas = topLevelKeys(shape)
  assertKnownCategories(metas, opts.categories)
  const keys = Object.keys(metas)
  const out: string[] = [
    ...opts.preamble,
    '',
    '## Keys',
    '',
    '| Key | Category | Shape | Applies via | Layers |',
    '|---|---|---|---|---|',
  ]
  for (const category of opts.categories) {
    for (const key of keys) {
      const meta = metas[key]!
      if (meta.category !== category) continue
      const shapeText = describeShape(resolveKeyPath(shape, [key]).schema)
      const reserved = isReserved(meta) ? ' (reserved)' : ''
      out.push(
        `| [${code(key)}](#${key})${reserved} | ${category} | ${cell(code(shapeText))} | ${code(meta.applies_via)} | ${meta.layers.join(', ')} |`,
      )
    }
  }

  for (const category of opts.categories) {
    const inCategory = keys.filter((k) => metas[k]!.category === category)
    if (inCategory.length === 0) continue
    out.push('', `## ${category[0]!.toUpperCase()}${category.slice(1)}`)
    for (const key of inCategory) {
      const meta = metas[key]!
      const resolved = resolveKeyPath(shape, [key])
      const dflt = defaultOf(resolved.schema)
      out.push('', `### ${key}`, '')
      out.push(meta.description, '')
      out.push('| Meta | Value |', '|---|---|')
      out.push(`| Shape | ${cell(code(describeShape(resolved.schema)))} |`)
      out.push(
        `| Default | ${isCollection(dflt) ? 'see below' : dflt === undefined ? 'unset' : cell(inlineDefault(dflt))} |`,
      )
      out.push(
        `| Enforcement | ${code(meta.enforcement)} (see [the enforcement table](${opts.enforcementDoc})) |`,
      )
      if (meta.deprecation !== undefined) {
        const d = meta.deprecation
        const use = d.use !== undefined ? `; use ${code(d.use)}` : ''
        out.push(`| Deprecated | since ${d.since}, removed in ${d.removeIn}${use} |`)
      }
      out.push(`| Applies via | ${code(meta.applies_via)} |`)
      out.push(`| Layers | ${meta.layers.join(', ')} |`)
      out.push(`| Runs in | ${meta.runs_in.join(', ')} |`)
      out.push(`| Consumers | ${meta.consumers.map((c) => cell(code(c))).join('<br>')} |`)
      if (isCollection(dflt)) {
        out.push('', 'Default:', '', '```yaml', dumpValue({ [key]: dflt }).trimEnd(), '```')
      }
      const fields = nestedFields(resolved.schema)
      if (fields.length > 0) {
        out.push('', '#### Fields', '', ...fieldsTable(fields))
        out.push(...nestedSections(shape, [key], 5))
      }
    }
  }
  return out.join('\n') + '\n'
}
