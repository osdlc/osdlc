/**
 * Check the beta corpus: one file per harness under corpora/beta/harnesses/.
 *
 *   node src/beta/validate.ts                  check the corpus and that schema/beta/harness.schema.json is current
 *   node src/beta/validate.ts --write-schema   rewrite schema/beta/harness.schema.json from src/beta/schema.ts, then check
 *
 * Exits 1 on any error.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

import { type Harness, harnessSchema } from './schema.ts'

export const ROOT = resolve(import.meta.dirname, '../..')
export const HARNESSES = join(ROOT, 'corpora', 'beta', 'harnesses')
export const SCHEMA_FILE = join(ROOT, 'schema', 'beta', 'harness.schema.json')

const ID = /^[a-z0-9][a-z0-9-]*$/

/** Split a Markdown file into its YAML frontmatter and body. Throws on a missing block. */
export function parseFile(text: string): { frontmatter: unknown; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!match) throw new Error('no frontmatter block')
  return { frontmatter: parseYaml(match[1] ?? ''), body: match[2] ?? '' }
}

/** Read every `<id>.md` in `dir` and check it. */
export function load(dir: string = HARNESSES): {
  harnesses: Map<string, Harness>
  errors: string[]
} {
  const harnesses = new Map<string, Harness>()
  const errors: string[] = []
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()

  for (const file of files) {
    const id = file.slice(0, -'.md'.length)
    if (!ID.test(id)) errors.push(`${file}: filename must be lowercase letters, digits and hyphens`)
    let parsed: { frontmatter: unknown; body: string }
    try {
      parsed = parseFile(readFileSync(join(dir, file), 'utf8'))
    } catch (e) {
      errors.push(`${file}: ${(e as Error).message}`)
      continue
    }
    if (parsed.body.trim() === '') errors.push(`${file}: body is empty`)
    const result = harnessSchema.safeParse(parsed.frontmatter)
    if (!result.success) {
      for (const issue of result.error.issues)
        errors.push(`${file}: ${issue.path.join('.') || '(frontmatter)'}: ${issue.message}`)
      continue
    }
    harnesses.set(id, result.data)
  }

  for (const [id, h] of harnesses) {
    for (const key of ['successor', 'fork_of'] as const) {
      const target = h[key]
      if (target === undefined) continue
      if (target === id) errors.push(`${id}.md: ${key} points at itself`)
      else if (!harnesses.has(target)) errors.push(`${id}.md: ${key} "${target}" is not a harness`)
    }
  }

  if (files.length === 0) errors.push(`${dir}: no harness files`)
  return { harnesses, errors }
}

export function schemaText(): string {
  return `${JSON.stringify(z.toJSONSchema(harnessSchema, { io: 'input' }), null, 2)}\n`
}

/** Report the schema file as stale when it differs from src/beta/schema.ts, or rewrite it. */
export function checkSchema(path: string = SCHEMA_FILE, write = false): string[] {
  const want = schemaText()
  if (write) {
    writeFileSync(path, want)
    return []
  }
  // Compared as data, so a formatter's whitespace never reads as stale.
  let have: unknown = null
  try {
    have = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    // reported below as stale
  }
  if (JSON.stringify(have) !== JSON.stringify(JSON.parse(want)))
    return ['schema/beta/harness.schema.json is stale: run `pnpm run write-schema:beta`']
  return []
}

// `import.meta.main` exists only from Node 24.2, so compare the entry path instead.
if (import.meta.filename === process.argv[1]) {
  const { values } = parseArgs({ options: { 'write-schema': { type: 'boolean' } } })
  const errors = checkSchema(SCHEMA_FILE, values['write-schema'] === true)
  const { harnesses, errors: fileErrors } = load()
  errors.push(...fileErrors)

  if (errors.length > 0) {
    for (const e of errors) process.stderr.write(`${e}\n`)
    process.stderr.write(`\n${errors.length} error(s)\n`)
    process.exit(1)
  }
  process.stdout.write(`ok: ${harnesses.size} harnesses\n`)
}
