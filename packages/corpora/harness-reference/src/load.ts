/**
 * Read the OKF bundle under bundle/ and check it: OKF v0.2 conformance (§11),
 * each concept's frontmatter against its schema, then the rules a schema
 * cannot state (ids from paths, references between concepts, source ids,
 * version spelling, observation order, repository links that must resolve).
 * Probes under probes/ are read and checked alongside it.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

import {
  type Category,
  type Fact,
  type Harness,
  type Probe,
  type Subject,
  categorySchema,
  factSchema,
  harnessSchema,
  probeSchema,
  rootIndexSchema,
  subjectSchema,
} from './schema.ts'

export const ROOT = resolve(import.meta.dirname, '..')
export const BUNDLE = join(ROOT, 'bundle')
export const PROBES = join(ROOT, 'probes')

/** Links into this repository are written as GitHub blob URLs so they work outside it. */
const REPO_BLOB = 'https://github.com/osdlc/skillwright/blob/main/'

export interface Dataset {
  categories: Category[]
  subjects: Subject[]
  harnesses: Harness[]
  facts: Fact[]
  probes: Probe[]
}

export interface LoadResult {
  dataset: Dataset | null
  errors: string[]
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const VALUE_KEY = /^[a-z][a-z0-9_]*$/
const RESERVED = new Set(['index.md', 'log.md'])

interface Doc {
  /** Path inside the bundle, with `/` separators. */
  path: string
  frontmatter: unknown
  body: string
}

/** Split a markdown file into its YAML frontmatter and body. Throws on a missing or bad block. */
export function parseConcept(text: string): { frontmatter: unknown; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!match) throw new Error('no frontmatter block')
  return { frontmatter: parseYaml(match[1] ?? ''), body: match[2] ?? '' }
}

/** Compare two semver strings by precedence (semver 2.0.0 §11): -1, 0 or 1. */
export function semverOrder(a: string, b: string): number {
  const split = (v: string): [number[], string[]] => {
    const [core = '', pre] = v.split(/-(.*)/s, 2)
    return [core.split('.').map(Number), pre === undefined ? [] : pre.split('.')]
  }
  const [ca, pa] = split(a)
  const [cb, pb] = split(b)
  for (let i = 0; i < 3; i++) {
    const d = (ca[i] ?? 0) - (cb[i] ?? 0)
    if (d !== 0) return Math.sign(d)
  }
  if (pa.length === 0 || pb.length === 0) return Math.sign(pb.length - pa.length)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i]
    const y = pb[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    const nx = /^\d+$/.test(x)
    const ny = /^\d+$/.test(y)
    if (nx && ny) return Math.sign(Number(x) - Number(y))
    if (nx) return -1
    if (ny) return 1
    return x < y ? -1 : 1
  }
  return 0
}

function walk(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const full = join(dir, name)
      return statSync(full).isDirectory() ? walk(full) : name.endsWith('.md') ? [full] : []
    })
}

function issues(file: string, error: z.ZodError): string[] {
  return error.issues.map((i) => `${file}: ${i.path.join('.') || '(root)'}: ${i.message}`)
}

/** The nearest ancestor holding `.git`, or null once the folder lives outside a repository. */
export function repoRoot(from: string = ROOT): string | null {
  let dir = from
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** A path that names one machine: a home directory, absolute, `~/` or `$HOME`. Probe commands stay relative. */
const MACHINE_PATH = /(^|[\s'"=:(])(\/(Users|home)\/|~\/|\$\{?HOME\b)/

/** Read `probes/<id>/probe.md` for each folder under `dir`. */
function loadProbes(dir: string, errors: string[]): Probe[] {
  if (!existsSync(dir)) return []
  const probes: Probe[] = []
  for (const name of readdirSync(dir).sort()) {
    const folder = join(dir, name)
    if (!statSync(folder).isDirectory()) continue
    const where = `probes/${name}/probe.md`
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      errors.push(`probes/${name}: use lowercase letters, digits and hyphens`)
      continue
    }
    const file = join(folder, 'probe.md')
    if (!existsSync(file)) {
      errors.push(`${where}: missing`)
      continue
    }
    try {
      const r = probeSchema.safeParse(parseConcept(readFileSync(file, 'utf8')).frontmatter)
      if (!r.success) {
        errors.push(...issues(where, r.error))
        continue
      }
      probes.push({ ...r.data, id: name, fixture: existsSync(join(folder, 'fixture')) })
    } catch (e) {
      errors.push(`${where}: ${(e as Error).message}`)
    }
  }
  return probes
}

/**
 * Load and check a bundle and its probes. `repo` is the checkout repository
 * links resolve against; null skips that check, as it must once the folder
 * leaves the repo.
 */
export function load(
  bundle: string = BUNDLE,
  repo: string | null = repoRoot(bundle),
  probesDir: string = PROBES,
): LoadResult {
  const errors: string[] = []
  const docs: Doc[] = []

  for (const full of walk(bundle)) {
    const path = relative(bundle, full).split(sep).join('/')
    const name = path.split('/').pop() ?? ''
    const text = readFileSync(full, 'utf8')
    if (RESERVED.has(name)) {
      if (path === 'index.md') {
        try {
          const parsed = rootIndexSchema.safeParse(parseConcept(text).frontmatter)
          if (!parsed.success) errors.push(...issues(path, parsed.error))
        } catch (e) {
          errors.push(`${path}: ${(e as Error).message}; the root index declares okf_version`)
        }
      } else if (text.startsWith('---\n')) {
        errors.push(`${path}: only the bundle-root index.md may carry frontmatter (OKF §8)`)
      }
      continue
    }
    try {
      const { frontmatter, body } = parseConcept(text)
      const type = (frontmatter as { type?: unknown } | null)?.type
      if (typeof type !== 'string' || type === '')
        errors.push(`${path}: frontmatter needs a non-empty \`type\` (OKF §11)`)
      docs.push({ path, frontmatter, body })
    } catch (e) {
      errors.push(`${path}: ${(e as Error).message}`)
    }
  }

  const categories: Category[] = []
  const subjects: Subject[] = []
  const harnesses: Harness[] = []
  const facts: Fact[] = []
  const factDocs = new Map<Fact, Doc>()

  for (const doc of docs) {
    const parts = doc.path.replace(/\.md$/, '').split('/')
    const [top] = parts
    if (top === 'categories' && parts.length === 2) {
      const r = categorySchema.safeParse(doc.frontmatter)
      if (r.success) categories.push({ ...r.data, id: parts[1]! })
      else errors.push(...issues(doc.path, r.error))
    } else if (top === 'subjects' && parts.length === 3) {
      const r = subjectSchema.safeParse(doc.frontmatter)
      if (r.success)
        subjects.push({ ...r.data, id: `${parts[1]}/${parts[2]}`, category: parts[1]! })
      else errors.push(...issues(doc.path, r.error))
    } else if (top === 'harnesses' && parts.length === 2) {
      const r = harnessSchema.safeParse(doc.frontmatter)
      if (r.success) harnesses.push({ ...r.data, id: parts[1]! })
      else errors.push(...issues(doc.path, r.error))
    } else if (top === 'facts' && parts.length === 4) {
      const r = factSchema.safeParse(doc.frontmatter)
      if (!r.success) {
        errors.push(...issues(doc.path, r.error))
        continue
      }
      const fact: Fact = { ...r.data, conceptId: parts.join('/') }
      if (fact.harness !== parts[1])
        errors.push(`${doc.path}: harness "${fact.harness}" must match the path`)
      if (fact.subject !== `${parts[2]}/${parts[3]}`)
        errors.push(`${doc.path}: subject "${fact.subject}" must match the path`)
      facts.push(fact)
      factDocs.set(fact, doc)
    } else {
      errors.push(
        `${doc.path}: unexpected location; concepts live in categories/, subjects/<category>/, harnesses/ or facts/<harness>/<category>/`,
      )
    }
  }

  const byOrder = (a: { order: number; id: string }, b: { order: number; id: string }): number =>
    a.order - b.order || a.id.localeCompare(b.id)
  categories.sort(byOrder)
  subjects.sort(byOrder)
  harnesses.sort(byOrder)

  const categoryIds = new Set(categories.map((c) => c.id))
  const subjectById = new Map(subjects.map((s) => [s.id, s]))
  const harnessById = new Map(harnesses.map((h) => [h.id, h]))
  const probes = loadProbes(probesDir, errors)
  const probeById = new Map(probes.map((p) => [p.id, p]))
  for (const p of probes) {
    const where = `probes/${p.id}/probe.md`
    for (const s of p.subjects)
      if (!subjectById.has(s)) errors.push(`${where}: subject "${s}" has no subjects/ concept`)
    for (const h of p.harnesses)
      if (!harnessById.has(h)) errors.push(`${where}: harness "${h}" has no harnesses/ concept`)
    const listed = new Set(p.harnesses)
    for (const h of p.harnesses)
      if (!(h in p.commands)) errors.push(`${where}: no commands for harness "${h}"`)
    for (const [h, steps] of Object.entries(p.commands)) {
      if (!listed.has(h)) errors.push(`${where}: commands for "${h}", which is not in harnesses`)
      for (const step of steps)
        if (MACHINE_PATH.test(step))
          errors.push(`${where}: command "${step}" names a home directory; use a relative path`)
    }
  }
  for (const s of subjects)
    if (!categoryIds.has(s.category))
      errors.push(`subjects/${s.id}.md: no category concept categories/${s.category}.md`)

  const checkResource = (where: string, url: string): void => {
    if (repo === null || !url.startsWith(REPO_BLOB)) return
    const rel = url.slice(REPO_BLOB.length)
    if (!existsSync(join(repo, rel)))
      errors.push(`${where}: ${rel} does not exist in the repository`)
  }
  const checkFootnotes = (where: string, body: string, ids: Set<string>): void => {
    for (const m of body.matchAll(/\[\^([^\]]+)\]/g))
      if (!ids.has(m[1]!)) errors.push(`${where}: footnote [^${m[1]}] names no sources entry`)
  }

  for (const h of harnesses) {
    const where = `harnesses/${h.id}.md`
    const ids = new Set(h.sources.map((s) => s.id))
    for (const s of h.sources) checkResource(where, s.resource)
    const doc = docs.find((d) => d.path === where)
    if (doc) checkFootnotes(where, doc.body, ids)
  }

  for (const fact of facts) {
    const where = `${fact.conceptId}.md`
    const harness = harnessById.get(fact.harness)
    if (!harness) errors.push(`${where}: harness "${fact.harness}" has no harnesses/ concept`)
    const subject = subjectById.get(fact.subject)
    if (!subject) errors.push(`${where}: subject "${fact.subject}" has no subjects/ concept`)

    const ids = new Set<string>()
    for (const s of fact.sources) {
      if (ids.has(s.id)) errors.push(`${where}: duplicate sources id "${s.id}"`)
      ids.add(s.id)
      checkResource(where, s.resource)
    }
    const cited = new Set<string>()
    const cite = (at: string, sid: string): void => {
      cited.add(sid)
      if (!ids.has(sid)) errors.push(`${at}: source "${sid}" is not in sources`)
    }

    let previous = ''
    fact.observations.forEach((o, i) => {
      const at = `${where}: observation ${i + 1}`
      if (o.observed < previous) errors.push(`${at}: observations must be oldest first`)
      previous = o.observed
      cite(at, o.source)
      if (o.via !== undefined) cite(at, o.via)
      for (const key of Object.keys(o.value))
        if (!VALUE_KEY.test(key)) errors.push(`${at}: value key "${key}" is not snake_case`)
      if (o.evidence === 'run') {
        if (o.probe === undefined) errors.push(`${at}: evidence run needs a probe`)
        if (o.checked_version === undefined)
          errors.push(`${at}: evidence run needs a checked_version`)
      } else if (o.probe !== undefined) {
        errors.push(`${at}: probe is set, but evidence is not run`)
      }
      if (o.probe !== undefined) {
        const p = probeById.get(o.probe)
        if (!p) errors.push(`${at}: probe "${o.probe}" has no probes/${o.probe}/probe.md`)
        else {
          if (!p.harnesses.includes(fact.harness))
            errors.push(`${at}: probe "${p.id}" does not list harness ${fact.harness}`)
          if (!p.subjects.includes(fact.subject))
            errors.push(`${at}: probe "${p.id}" does not list subject ${fact.subject}`)
        }
      }
      if (o.model !== undefined && subject && subject.model_dependent !== true)
        errors.push(`${at}: model is set, but subject ${fact.subject} is not model_dependent`)
      if (!harness) return
      for (const [label, v] of [
        ['since', o.since],
        ['until', o.until],
      ] as const) {
        if (v === null) continue
        if (harness.versioning === 'semver' && !SEMVER.test(v))
          errors.push(`${at}: ${label} "${v}" is not a semver version`)
        if (harness.versioning === 'date' && !DATE.test(v))
          errors.push(`${at}: ${label} "${v}" is not a YYYY-MM-DD date`)
        if (harness.versioning === 'unknown')
          errors.push(`${at}: ${label} is set, but ${harness.id} has no known versioning`)
      }
      if (o.since !== null && o.until !== null) {
        const order =
          harness.versioning === 'semver'
            ? semverOrder(o.since, o.until)
            : o.since.localeCompare(o.until)
        if (order >= 0) errors.push(`${at}: since must come before until`)
      }
    })
    // Parts of one answer (same date and model, still in force) must answer different keys.
    const answered = new Map<string, number>()
    fact.observations.forEach((o, i) => {
      if (o.until !== null) return
      for (const key of Object.keys(o.value)) {
        const slot = `${o.observed} ${o.model ?? ''} ${key}`
        const first = answered.get(slot)
        if (first === undefined) answered.set(slot, i + 1)
        else
          errors.push(
            `${where}: observation ${i + 1}: key "${key}" is already answered by observation ${first} from the same date; merge them or use distinct keys`,
          )
      }
    })
    for (const q of fact.open ?? []) cite(`${where}: open question`, q.source)
    for (const sid of ids)
      if (!cited.has(sid)) errors.push(`${where}: sources entry "${sid}" is never cited`)
    const doc = factDocs.get(fact)
    if (doc) checkFootnotes(where, doc.body, ids)
  }

  const seen = new Set<string>()
  for (const f of facts) {
    const key = `${f.harness} ${f.subject}`
    if (seen.has(key)) errors.push(`${f.conceptId}.md: duplicate fact for ${key}`)
    seen.add(key)
  }

  if (harnesses.length === 0 || subjects.length === 0)
    errors.push('bundle: no harnesses or no subjects found')
  return { dataset: { categories, subjects, harnesses, facts, probes }, errors }
}
