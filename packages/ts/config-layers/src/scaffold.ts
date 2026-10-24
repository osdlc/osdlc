/**
 * Config scaffold: an annotated YAML file generated from a tool's Zod config
 * schema.
 *
 * The schema defines the config, and the annotated YAML is derived from it.
 * Every key, its default value, whether it is optional, and its `.describe()`
 * prose come from the schema. A new key, a changed default or a reworded
 * description shows up in the scaffold file with no edit, so the two cannot
 * disagree.
 *
 * The emitted values equal `schema.parse({})`, so writing the file changes no
 * behavior. It only documents the config. Optional keys with no default are
 * emitted commented out.
 *
 * The tool supplies the header comment (its name, how to regenerate, where the
 * prose lives) and any tool-specific notes. Nothing here names a tool. Reads
 * of Zod internals go through `./schema.ts`, the one module that reads them.
 * The `.description` read is Zod's public getter, not an internal.
 */

import type { z } from 'zod'

import { assertKnownCategories, readConfigMeta } from './meta.ts'
import { enumValues, fieldInfo, kindOf, shapeOf, unwrapSchema } from './schema.ts'

const WRAP_COL = 78

/**
 * Options for scaffolding a commented starter config file from a schema.
 * @experimental
 */
export interface ScaffoldOptions {
  /**
   * Extra commented lines to append directly under a leaf key, keyed by that
   * key's name (e.g. `{ docs_site: ["see also: ..."] }` renders each as a
   * `# see also: ...` suggestion under `docs_site:`). A record-valued key also
   * takes entries keyed `<key>.<name>` (`hooks.build`): each renders under
   * the record as `#   <name>: detected — uncomment any to use:`, followed by
   * its lines, in the order the keys appear. A tool uses this to offer values
   * it detected.
   */
  extraCommentsByKey?: Record<string, string[]>
  /**
   * Verbatim comment lines (each already starting `#`, without indent) to
   * render under a record-valued key, before its `<key>.<name>` entries. A
   * tool uses this to show an example of the record's entries.
   */
  recordNotes?: Record<string, string[]>
}

/** Render a scalar/array/map default as its YAML value token. */
function renderValue(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]'
    return '[' + v.map((e) => renderScalarString(String(e))).join(', ') + ']'
  }
  if (typeof v === 'string') return renderScalarString(v)
  // A record leaf (`z.record(…)`, e.g. `paths:`) reaches here with a
  // plain-object default. The `String(v)` fallback would render it as
  // `[object Object]`, which YAML reads back as a sequence. Render a flow map.
  if (v !== null && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
    if (entries.length === 0) return '{}'
    const pairs = entries.map(([k, e]) => `${renderScalarString(k)}: ${renderValue(e)}`)
    return '{ ' + pairs.join(', ') + ' }'
  }
  // undefined should not reach a leaf. Handle it anyway.
  return v === null ? 'null' : String(v)
}

/**
 * Quote a YAML string only when bare would be ambiguous.
 *
 * @experimental
 */
function renderScalarString(s: string): string {
  const needsQuote =
    s === '' ||
    s !== s.trim() ||
    /^(true|false|null|~|-|\d)/i.test(s) ||
    /[:#{}\[\]&*!|>'"%@,`]/.test(s)
  return needsQuote ? `'${s.replace(/'/g, "''")}'` : s
}

/**
 * Wrap `text` into `<indent># <chunk>` comment lines at WRAP_COL, breaking on spaces.
 *
 * @experimental
 */
function commentLines(text: string, indent: string): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  const out: string[] = []
  let cur = ''
  for (const w of words) {
    const candidate = cur === '' ? w : `${cur} ${w}`
    if ((indent + '# ' + candidate).length > WRAP_COL && cur !== '') {
      out.push(`${indent}# ${cur}`)
      cur = w
    } else {
      cur = candidate
    }
  }
  if (cur !== '') out.push(`${indent}# ${cur}`)
  return out
}

function renderShape(
  shape: Record<string, z.ZodTypeAny>,
  indent: string,
  lines: string[],
  opts: ScaffoldOptions,
  topLevel: boolean,
): void {
  let first = true
  for (const [key, sub] of Object.entries(shape)) {
    if (topLevel && !first) lines.push('')
    first = false

    const desc = String((sub as { description?: unknown }).description ?? '').trim()
    if (desc !== '') lines.push(...commentLines(desc, indent))

    const kind = kindOf(sub)
    // Optional with no default (e.g. a reserved section): the all-defaults
    // object has no such key, so the section renders commented out. An
    // uncommented `key: {}` would parse back as `{}`, not absent.
    const unfield = fieldInfo(sub)
    const absent = unfield.optional && unfield.defaultValue === undefined
    if (kind === 'object') {
      const subLines: string[] = []
      renderShape(shapeOf(unwrapSchema(sub)), indent + '  ', subLines, opts, false)
      if (absent) {
        lines.push(`${indent}# ${key}:`)
        lines.push(...commentOutLines(subLines))
        continue
      }
      // When every field in the object is optional with no default (or the
      // object has no fields), the body is comment lines only. A bare `key:`
      // with only comments beneath it parses back as `null`, not `{}`. So
      // write `key: {}` to keep the round trip, with the comments below it.
      const hasContent = subLines.some((l) => {
        const t = l.trim()
        return t !== '' && !t.startsWith('#')
      })
      lines.push(hasContent ? `${indent}${key}:` : `${indent}${key}: {}`)
      lines.push(...subLines)
      continue
    }

    if (kind === 'record') {
      if (absent) {
        lines.push(`${indent}# ${key}:`)
        continue
      }
      lines.push(`${indent}${key}: ${renderValue(unfield.defaultValue ?? {})}`)
      for (const note of opts.recordNotes?.[key] ?? []) lines.push(`${indent}${note}`)
      const entryPrefix = `${key}.`
      for (const [extraKey, extra] of Object.entries(opts.extraCommentsByKey ?? {})) {
        if (extraKey.startsWith(entryPrefix)) {
          if (extra.length === 0) continue
          lines.push(
            `${indent}#   ${extraKey.slice(entryPrefix.length)}: detected — uncomment any to use:`,
          )
          for (const line of extra) lines.push(`${indent}#     - ${line}`)
        }
      }
      for (const line of opts.extraCommentsByKey?.[key] ?? []) lines.push(`${indent}# ${line}`)
      continue
    }

    const choices = enumValues(sub)
    if (choices) lines.push(`${indent}# one of: ${choices.join(' | ')}`)

    if (unfield.defaultValue !== undefined) {
      lines.push(`${indent}${key}: ${renderValue(unfield.defaultValue)}`)
    } else {
      // Optional with no default: show it commented out, so a reader finds the key.
      lines.push(`${indent}# ${key}:`)
    }

    const extra = opts.extraCommentsByKey?.[key]
    if (extra && extra.length > 0) {
      for (const line of extra) lines.push(`${indent}# ${line}`)
    }
  }
}

/**
 * The fully annotated file for a fresh project: `header` lines, then every key
 * at its schema default with its description as a comment.
 * @experimental
 */
export function scaffoldYaml(
  schema: z.ZodTypeAny,
  header: readonly string[],
  opts: ScaffoldOptions = {},
): string {
  const lines: string[] = [...header, '']
  renderShape(shapeOf(unwrapSchema(schema)), '', lines, opts, true)
  return lines.join('\n') + '\n'
}

/**
 * Comment out every non-blank line of a rendered scaffold body, preserving indentation.
 *
 * @experimental
 */
function commentOutLines(lines: string[]): string[] {
  return lines.map((line) => {
    if (line.trim() === '') return line
    const indent = /^\s*/.exec(line)?.[0] ?? ''
    const rest = line.slice(indent.length)
    return rest.startsWith('#') ? line : `${indent}# ${rest}`
  })
}

/**
 * A commented override template: the same output as {@link scaffoldYaml} with
 * every key commented out, under `header`. It is for the gitignored overlay
 * file, where a key overrides the committed file once uncommented. Maps merge
 * recursively, and lists and scalars replace (see `deepMergeConfig`).
 * @experimental
 */
export function scaffoldLocalYaml(
  schema: z.ZodTypeAny,
  header: readonly string[],
  opts: ScaffoldOptions = {},
): string {
  const body: string[] = []
  renderShape(shapeOf(unwrapSchema(schema)), '', body, opts, true)
  return [...header, ''].join('\n') + '\n' + commentOutLines(body).join('\n') + '\n'
}

/**
 * Input to {@link starterYaml}.
 *
 * @experimental
 */
export interface StarterOptions {
  /** The commented header lines the file opens with. */
  header: readonly string[]
  /**
   * The tool's categories, in banner order. Every key's category must be one
   * of them (a vocabulary's `spec.categories`, `./vocabulary.ts`).
   */
  categories: readonly string[]
  /**
   * Record-valued keys to set live, by key then entry name:
   * `{ workflows: { check: ['just ci'] } }`. Empty lists are dropped. A key with
   * none left renders commented out like every other section.
   */
  live?: Record<string, Record<string, string[]>>
  /** Notes and detected entries for the commented skeletons, as for {@link scaffoldYaml}. */
  scaffold?: ScaffoldOptions
}

/**
 * The starter file written for a fresh project. The `live` entries are set
 * under their keys. Every other top-level key is commented out: its schema
 * description, then its default block. Keys are grouped under a banner per
 * meta `category`. {@link scaffoldYaml} writes every key uncommented at its
 * default. The starter's only uncommented values are the `live` ones, so it
 * parses to the all-defaults object plus those entries.
 * @experimental
 */
export function starterYaml(schema: z.ZodTypeAny, opts: StarterOptions): string {
  const shape = shapeOf(unwrapSchema(schema))
  const metas = readConfigMeta(shape)
  assertKnownCategories(metas, opts.categories)
  const live = Object.fromEntries(
    Object.entries(opts.live ?? {})
      .map(([key, entries]) => [
        key,
        Object.fromEntries(Object.entries(entries).filter(([, list]) => list.length > 0)),
      ])
      .filter(([, entries]) => Object.keys(entries as object).length > 0),
  ) as Record<string, Record<string, string[]>>
  const lines: string[] = [...opts.header]
  for (const category of opts.categories) {
    const keys = Object.keys(shape).filter((k) => metas[k]!.category === category)
    if (keys.length === 0) continue
    lines.push('', `# ── ${category} ${'─'.repeat(Math.max(0, WRAP_COL - category.length - 6))}`)
    for (const key of keys) {
      const sub = shape[key]!
      lines.push('')
      const entries = live[key]
      if (entries !== undefined) {
        const desc = String(sub.description ?? '').trim()
        if (desc !== '') lines.push(...commentLines(desc, ''))
        lines.push(`${key}:`)
        for (const [name, list] of Object.entries(entries)) {
          lines.push(`  ${renderScalarString(name)}:`)
          for (const v of list) lines.push(`    - ${renderScalarString(v)}`)
        }
        continue
      }
      const body: string[] = []
      renderShape({ [key]: sub }, '', body, opts.scaffold ?? {}, true)
      lines.push(...commentOutLines(body))
    }
  }
  return lines.join('\n') + '\n'
}
