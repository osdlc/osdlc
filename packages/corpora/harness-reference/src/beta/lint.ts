/**
 * `lint`: the rules that compare records, which a record's schema cannot hold. Run after
 * `corpus-schema validate`. See corpora/beta/statements/statements.schema.md.
 */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Ajv2020 } from 'ajv/dist/2020.js'

import { type Beta, BETA, loadBeta } from './corpus.ts'
import { overlaps, type Versioning, validVersion, compareVersions } from './versions.ts'

interface Scope {
  since: string | null
  until: string | null
  platform: string[]
  model: string | null
}

const MACHINE_PATH = /(^|[\s'"=:(])(\/(Users|home)\/|~\/|\$\{?HOME\b)/u

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/** One line per broken rule, as `<file>: <message>`. */
export function lint(beta: Beta): string[] {
  const problems: string[] = []
  const bad = (file: string, message: string): void => void problems.push(`${file}: ${message}`)
  const ajv = new Ajv2020({ strict: false, allErrors: true })

  // Harness and subject slugs are keys outside the corpus, so they are unique.
  for (const type of ['harnesses', 'subjects'] as const) {
    const seen = new Map<string, string>()
    for (const { ref, data } of beta.all(type)) {
      const slug = str(data['slug'])
      if (slug === undefined) continue
      const first = seen.get(slug)
      if (first !== undefined) bad(ref.file, `slug "${slug}" is also used by ${first}`)
      else seen.set(slug, ref.file)
    }
  }
  for (const { ref, data } of beta.all('subjects')) {
    const slug = str(data['slug']) ?? ''
    const parts = slug.split('/')
    const [category, name] = parts
    if (data['category'] !== category) bad(ref.file, `slug "${slug}" must start with its category`)
    const folder = ref.file.split('/')[1]
    if (folder !== category) bad(ref.file, `a ${category} subject belongs in subjects/${category}/`)
    if (parts.length !== 2 || category === '' || name === '')
      bad(ref.file, 'slug must be <category>/<name>, with exactly one "/"')
    try {
      ajv.compile(obj(data['valueSchema']))
    } catch (e) {
      bad(ref.file, `valueSchema does not compile: ${(e as Error).message}`)
    }
  }

  // Methods.
  for (const { ref, data } of beta.all('methods')) {
    const slugs = new Set<string>()
    for (const link of (data['harnesses'] as unknown[] | undefined) ?? []) {
      const h = beta.resolve(ref.file, link)
      const slug = h === undefined ? undefined : str(beta.get('harnesses', h.id)?.['slug'])
      if (slug !== undefined) slugs.add(slug)
    }
    const commands = obj(data['commands'])
    for (const slug of slugs)
      if (!(slug in commands)) bad(ref.file, `no commands for harness ${slug}`)
    for (const [slug, steps] of Object.entries(commands)) {
      if (!slugs.has(slug)) bad(ref.file, `commands for ${slug}, which is not in harnesses`)
      for (const step of Array.isArray(steps) ? steps : [])
        if (typeof step === 'string' && MACHINE_PATH.test(step))
          bad(ref.file, `command "${step}" names a home directory; use a relative path`)
    }
  }

  // Study results.
  for (const { ref, data } of beta.all('study-results')) {
    if (data['kind'] !== 'run') continue
    const method = beta.resolve(ref.file, data['specifiedBy'])
    if (method === undefined) {
      bad(ref.file, 'a run needs specifiedBy')
      continue
    }
    const harness = beta.resolve(ref.file, data['harness'])
    const listed = ((beta.get('methods', method.id)?.['harnesses'] as unknown[]) ?? []).map(
      (l) => beta.resolve(method.file, l)?.file,
    )
    if (harness !== undefined && !listed.includes(harness.file))
      bad(ref.file, `method ${method.id} does not list harness ${harness.id}`)
  }

  // Statements.
  const statements = beta.all('statements')
  const cells = new Map<string, { file: string; scope: Scope; versioning: Versioning }[]>()
  for (const { ref, data } of statements) {
    const harness = beta.resolve(ref.file, data['harness'])
    const subject = beta.resolve(ref.file, data['subject'])
    if (harness === undefined || subject === undefined) continue
    const harnessData = beta.get('harnesses', harness.id) ?? {}
    const subjectData = beta.get('subjects', subject.id) ?? {}
    const prop = obj(data['proposition'])
    const status = str(data['status'])
    const scope = obj(data['scope']) as unknown as Scope
    const versioning = (str(harnessData['versioning']) ?? 'unknown') as Versioning

    if (beta.resolve(ref.file, prop['subject'])?.file !== harness.file)
      bad(ref.file, 'proposition.subject must link the same harness as harness')
    if (prop['predicate'] !== subjectData['slug'])
      bad(
        ref.file,
        `proposition.predicate must be the subject's slug "${String(subjectData['slug'])}"`,
      )

    if (status !== 'open') {
      const schema = obj(subjectData['valueSchema'])
      try {
        const validate = ajv.compile(schema)
        if (!validate(prop['object']))
          for (const e of validate.errors ?? [])
            bad(
              ref.file,
              `proposition.object${e.instancePath} ${e.message ?? 'is invalid'} (valueSchema)`,
            )
      } catch {
        // The subject reports its own broken schema.
      }
    }

    if (
      scope.model !== null &&
      scope.model !== undefined &&
      subjectData['model_dependent'] !== true
    )
      bad(ref.file, `scope.model is set, but subject ${subject.id} is not model_dependent`)
    for (const key of ['since', 'until'] as const) {
      const v = scope[key]
      if (v === null || v === undefined) continue
      if (versioning === 'unknown')
        bad(ref.file, `scope.${key} is set, but ${harness.id} has no known versioning`)
      else if (!validVersion(v, versioning))
        bad(ref.file, `scope.${key} "${v}" is not a ${versioning} version`)
    }
    if (
      versioning !== 'unknown' &&
      scope.since != null &&
      scope.until != null &&
      compareVersions(scope.since, scope.until, versioning) >= 0
    )
      bad(ref.file, 'scope.since must come before scope.until')

    if (data['supersedes'] !== undefined) {
      const target = beta.resolve(ref.file, data['supersedes'])
      if (target !== undefined && beta.get('statements', target.id)?.['status'] !== 'superseded')
        bad(ref.file, `supersedes ${target.id}, which does not have status superseded`)
      if (target !== undefined) {
        const t = beta.get('statements', target.id) ?? {}
        if (
          beta.resolve(target.file, t['harness'])?.file !== harness.file ||
          beta.resolve(target.file, t['subject'])?.file !== subject.file
        )
          bad(ref.file, `supersedes ${target.id}, which is about another harness or subject`)
      }
    }

    for (const line of (data['hasEvidenceLines'] as unknown[] | undefined) ?? []) {
      for (const link of (obj(line)['hasEvidenceItems'] as unknown[] | undefined) ?? []) {
        const target = beta.resolve(ref.file, link)
        if (target === undefined || target.type !== 'study-results')
          bad(ref.file, `evidence link ${String(link)} is not a study-results record`)
        else if (
          beta.resolve(target.file, beta.get('study-results', target.id)?.['harness'])?.file !==
          harness.file
        )
          bad(ref.file, `evidence ${target.id} is about another harness`)
      }
    }
    if (status === 'open' && data['direction'] !== 'neutral')
      bad(ref.file, 'an open statement is neutral')
    if ((status === 'current' || status === 'disputed') && data['direction'] !== 'supports')
      bad(ref.file, `a ${status} statement must have direction supports`)

    if (status === 'current' || status === 'disputed') {
      const key = `${harness.file}|${subject.file}|${scope.model ?? ''}`
      const list = cells.get(key) ?? []
      list.push({ file: ref.file, scope, versioning })
      cells.set(key, list)
    }
  }
  for (const list of cells.values())
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!
        const b = list[j]!
        const platformsMeet =
          a.scope.platform.length === 0 ||
          b.scope.platform.length === 0 ||
          a.scope.platform.some((p) => b.scope.platform.includes(p))
        if (
          platformsMeet &&
          (a.versioning === 'unknown' || overlaps(a.scope, b.scope, a.versioning))
        )
          bad(b.file, `a second current or disputed statement overlaps ${a.file}`)
      }
  return problems
}

function main(): number {
  const beta = loadBeta(process.argv[2] === undefined ? BETA : resolve(process.argv[2]))
  const problems = [...beta.report.errors, ...lint(beta)]
  for (const p of problems) console.error(p)
  if (problems.length > 0) {
    console.error(`beta: ${problems.length} problem(s)`)
    return 1
  }
  console.log(`beta lint ok: ${beta.report.records.get('statements')?.size ?? 0} statements`)
  return 0
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = main()
