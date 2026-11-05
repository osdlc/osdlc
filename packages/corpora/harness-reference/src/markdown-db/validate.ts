/**
 * markdown-db validator (docs/standards/S-GFFY-markdown-db.md, version 0). Reads a
 * corpus's manifest, then checks every type's entries. Nothing here knows a
 * particular corpus: every rule comes from the manifest, the schemas or the spec.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js'
import addFormatsModule, { type FormatsPlugin } from 'ajv-formats'
import { parse as parseYaml } from 'yaml'

// ajv-formats is CommonJS: under Node's ESM loader the plugin is the `default` property.
const addFormats = (addFormatsModule as unknown as { default: FormatsPlugin }).default

export const MANIFEST = 'markdown-db.yaml'
const ID = /^[a-z0-9][a-z0-9-]*$/
const TYPE_NAME = ID

interface TypeDef {
  path: string
  schema: string
}
interface Manifest {
  types: Record<string, TypeDef>
}

const FORMATS = ['.md', '.yaml', '.yml', '.json']

/** The extension of a path pattern, or '' when it has none. */
const extensionOf = (path: string): string => /\.[^./]+$/.exec(path)?.[0] ?? ''

/** Read one entry's record. Throws when the file is not in its format or the record is not an object. */
export function readRecord(text: string, ext: string): unknown {
  let record: unknown
  if (ext === '.md') record = parseFile(text).frontmatter
  else if (ext === '.json') record = JSON.parse(text)
  else record = parseYaml(text)
  if (record === null || typeof record !== 'object' || Array.isArray(record))
    throw new Error('record must be a mapping, not a scalar or list')
  return record
}

/** Split a Markdown file into its YAML frontmatter and body. Throws on a missing block. */
export function parseFile(text: string): { frontmatter: unknown; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!match) throw new Error('no frontmatter block')
  return { frontmatter: parseYaml(match[1] ?? ''), body: match[2] ?? '' }
}

/** Render one ajv error as `field: message`. */
function describe(e: ErrorObject): string {
  const path = e.instancePath.split('/').slice(1).join('.')
  const dotted = path === '' ? '' : `${path}.`
  if (e.keyword === 'additionalProperties')
    return `${dotted}${String(e.params.additionalProperty)}: unknown field`
  if (e.keyword === 'required') return `${dotted}${String(e.params.missingProperty)}: required`
  if (e.schemaPath.endsWith('/false schema'))
    return `${path}: not allowed here (see the if/then rule in the schema)`
  return `${path === '' ? '(frontmatter)' : path}: ${e.message ?? 'invalid'}`
}

/** Every file under `dir`, as paths relative to `base`, with forward slashes. */
function listFiles(base: string, dir: string): string[] {
  const abs = join(base, dir)
  if (!existsSync(abs)) return []
  return readdirSync(abs, { withFileTypes: true }).flatMap((d) => {
    const rel = dir === '' ? d.name : `${dir}/${d.name}`
    return d.isDirectory() ? listFiles(base, rel) : [rel]
  })
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Validate the corpus at `root`. Returns entry counts per type and the errors. */
export function validateCorpus(root: string): {
  entries: Map<string, Map<string, Record<string, unknown>>>
  errors: string[]
} {
  const entries = new Map<string, Map<string, Record<string, unknown>>>()
  const errors: string[] = []
  const manifestPath = join(root, MANIFEST)
  if (!existsSync(manifestPath)) return { entries, errors: [`${MANIFEST}: not found in ${root}`] }

  let manifest: Manifest
  try {
    manifest = parseYaml(readFileSync(manifestPath, 'utf8')) as Manifest
  } catch (e) {
    return { entries, errors: [`${MANIFEST}: ${(e as Error).message}`] }
  }
  if ((manifest as unknown as Record<string, unknown>)['markdown-db'] !== 0)
    errors.push(`${MANIFEST}: markdown-db: must be 0`)
  const types = manifest?.types
  if (types === null || typeof types !== 'object' || Object.keys(types).length === 0)
    return { entries, errors: [...errors, `${MANIFEST}: types: required, at least one type`] }

  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  ajv.addKeyword({ keyword: 'x-ref', schemaType: 'string' })

  interface Ref {
    field: string
    type: string
  }
  const compiled = new Map<string, { validate: ReturnType<typeof ajv.compile>; refs: Ref[] }>()
  const patterns = new Map<string, { dir: string; regex: RegExp }>()

  for (const [name, def] of Object.entries(types)) {
    if (!TYPE_NAME.test(name)) errors.push(`${MANIFEST}: types.${name}: bad type name`)
    const segments = String(def?.path ?? '').split('/')
    const last = segments[segments.length - 1] ?? ''
    if (
      typeof def?.path !== 'string' ||
      (def.path.match(/\{id\}/g) ?? []).length !== 1 ||
      !last.includes('{id}')
    ) {
      errors.push(`${MANIFEST}: types.${name}.path: must hold {id} once, in the last segment`)
      continue
    }
    if (!FORMATS.includes(extensionOf(def.path))) {
      errors.push(`${MANIFEST}: types.${name}.path: extension must be one of ${FORMATS.join(', ')}`)
      continue
    }
    patterns.set(name, {
      dir: segments.slice(0, -1).join('/'),
      regex: new RegExp(
        `^${segments
          .slice(0, -1)
          .map((s) => `${escape(s)}/`)
          .join('')}${escape(last).replace('\\{id\\}', '([^/]+)')}$`,
      ),
    })
    try {
      const schema = JSON.parse(readFileSync(join(root, String(def.schema)), 'utf8')) as {
        properties?: Record<string, { 'x-ref'?: string }>
      }
      const refs: Ref[] = Object.entries(schema.properties ?? {}).flatMap(([field, p]) =>
        p['x-ref'] === undefined ? [] : [{ field, type: p['x-ref'] }],
      )
      for (const r of refs)
        if (!(r.type in types))
          errors.push(`${def.schema}: ${r.field}: x-ref names unknown type "${r.type}"`)
      compiled.set(name, { validate: ajv.compile(schema), refs })
    } catch (e) {
      errors.push(`${MANIFEST}: types.${name}.schema: ${(e as Error).message}`)
    }
  }

  for (const [name, { dir, regex }] of patterns) {
    const found = new Map<string, Record<string, unknown>>()
    entries.set(name, found)
    for (const file of listFiles(root, dir).sort()) {
      const m = regex.exec(file)
      if (!m) {
        errors.push(`${file}: path: does not match ${types[name]?.path} (type ${name})`)
        continue
      }
      const id = m[1] ?? ''
      if (!ID.test(id)) {
        errors.push(`${file}: id: "${id}" must be lowercase letters, digits and hyphens`)
        continue
      }
      let fm: unknown
      try {
        fm = readRecord(readFileSync(join(root, file), 'utf8'), extensionOf(file))
      } catch (e) {
        errors.push(`${file}: ${(e as Error).message}`)
        continue
      }
      const c = compiled.get(name)
      if (c === undefined) continue
      if (!c.validate(fm)) {
        for (const e of c.validate.errors ?? []) {
          // The if/then wrapper repeats the `then` failure at the root.
          if (e.keyword !== 'if') errors.push(`${file}: ${describe(e)}`)
        }
        continue
      }
      found.set(id, fm as Record<string, unknown>)
    }
  }

  for (const [name, found] of entries) {
    const refs = compiled.get(name)?.refs ?? []
    for (const [id, fm] of found) {
      for (const { field, type } of refs) {
        const value = fm[field]
        if (value === undefined || !(type in types)) continue
        for (const target of Array.isArray(value) ? value : [value])
          if (!entries.get(type)?.has(String(target)))
            errors.push(
              `${types[name]?.path.replace('{id}', id)}: ${field}: "${String(target)}" is not a ${type}`,
            )
      }
    }
  }

  if (
    statSync(root).isDirectory() &&
    [...entries.values()].every((m) => m.size === 0) &&
    errors.length === 0
  )
    errors.push(`${root}: no entries`)
  return { entries, errors }
}
