/**
 * `lint`: the rules that compare records, which a record's schema cannot hold. Run after
 * `corpus-schema validate`. See corpus/statements/statements.schema.md.
 */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Ajv2020 } from 'ajv/dist/2020.js'

import {
  type LoadedCorpus,
  CORPUS_ROOT,
  KIND_STRENGTH,
  loadCorpus,
  type Strength,
  STRENGTHS,
} from './corpus.ts'
import { overlaps, type Versioning, validVersion, compareVersions } from './versions.ts'

interface Scope {
  since: string | null
  until: string | null
  platform: string[]
  model: string | null
}

/** A strength's index in STRENGTHS, or undefined when the value is not a strength. */
function rank(value: unknown): number | undefined {
  const i = STRENGTHS.indexOf(value as Strength)
  return i < 0 ? undefined : i
}

const MACHINE_PATH = /(^|[\s'"=:(])(\/(Users|home)\/|~\/|\$\{?HOME\b)/u

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/** One line per broken rule, as `<file>: <message>`. */
export function lint(corpus: LoadedCorpus): string[] {
  const problems: string[] = []
  const bad = (file: string, message: string): void => void problems.push(`${file}: ${message}`)
  const ajv = new Ajv2020({ strict: false, allErrors: true })

  // Harness and subject slugs are keys outside the corpus, so they are unique.
  for (const type of ['harnesses', 'subjects'] as const) {
    const seen = new Map<string, string>()
    for (const { ref, data } of corpus.all(type)) {
      const slug = str(data['slug'])
      if (slug === undefined) continue
      const first = seen.get(slug)
      if (first !== undefined) bad(ref.file, `slug "${slug}" is also used by ${first}`)
      else seen.set(slug, ref.file)
    }
  }
  for (const { ref, data } of corpus.all('subjects')) {
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
  for (const { ref, data } of corpus.all('methods')) {
    const slugs = new Set<string>()
    for (const link of (data['harnesses'] as unknown[] | undefined) ?? []) {
      const h = corpus.resolve(ref.file, link)
      const slug = h === undefined ? undefined : str(corpus.get('harnesses', h.id)?.['slug'])
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
  for (const { ref, data } of corpus.all('study-results')) {
    if (data['kind'] !== 'run') continue
    const method = corpus.resolve(ref.file, data['specifiedBy'])
    if (method === undefined) {
      bad(ref.file, 'a run needs specifiedBy')
      continue
    }
    const harness = corpus.resolve(ref.file, data['harness'])
    const listed = ((corpus.get('methods', method.id)?.['harnesses'] as unknown[]) ?? []).map(
      (l) => corpus.resolve(method.file, l)?.file,
    )
    if (harness !== undefined && !listed.includes(harness.file))
      bad(ref.file, `method ${method.id} does not list harness ${harness.id}`)
  }

  // Statements.
  const statements = corpus.all('statements')
  const chains = new Map<
    string,
    { file: string; status?: string; target?: string; broken?: boolean }[]
  >()
  const cells = new Map<string, { file: string; scope: Scope; versioning: Versioning }[]>()
  for (const { ref, data } of statements) {
    const harness = corpus.resolve(ref.file, data['harness'])
    const subject = corpus.resolve(ref.file, data['subject'])
    if (harness === undefined || subject === undefined) continue
    const harnessData = corpus.get('harnesses', harness.id) ?? {}
    const subjectData = corpus.get('subjects', subject.id) ?? {}
    const prop = obj(data['proposition'])
    const status = str(data['status'])
    const scope = obj(data['scope']) as unknown as Scope
    const versioning = (str(harnessData['versioning']) ?? 'unknown') as Versioning

    if (corpus.resolve(ref.file, prop['subject'])?.file !== harness.file)
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

    const supersedes = data['supersedes']
    const supersedesRef =
      supersedes === undefined ? undefined : corpus.resolve(ref.file, supersedes)
    // The statement a supersedes link names, or undefined; a link that resolves to anything else
    // is reported here, once.
    let supersedesTarget: typeof supersedesRef
    let supersedesReported = false
    if (supersedes !== undefined) {
      if (supersedesRef?.file === ref.file) {
        bad(ref.file, 'supersedes links to itself')
        supersedesReported = true
      } else if (supersedesRef !== undefined && supersedesRef.type !== 'statements') {
        bad(
          ref.file,
          `supersedes ${String(supersedes)}, which is a ${supersedesRef.type} record, not a statement`,
        )
        supersedesReported = true
      } else supersedesTarget = supersedesRef
    }
    if (supersedesTarget !== undefined) {
      const target = supersedesTarget
      if (corpus.get('statements', target.id)?.['status'] !== 'superseded')
        bad(ref.file, `supersedes ${target.id}, which does not have status superseded`)
      const t = corpus.get('statements', target.id) ?? {}
      if (
        corpus.resolve(target.file, t['harness'])?.file !== harness.file ||
        corpus.resolve(target.file, t['subject'])?.file !== subject.file
      )
        bad(ref.file, `supersedes ${target.id}, which is about another harness or subject`)
    }

    // Strength by rule: see corpus/README.md#statements.
    let strongestLine = -1
    for (const line of (data['hasEvidenceLines'] as unknown[] | undefined) ?? []) {
      const l = obj(line)
      const given = rank(l['strengthOfEvidenceProvided'])
      if (given === undefined) continue
      let max = -1
      for (const link of (l['hasEvidenceItems'] as unknown[] | undefined) ?? []) {
        const target = corpus.resolve(ref.file, link)
        if (target === undefined || target.type !== 'study-results') continue
        const kind = str(corpus.get('study-results', target.id)?.['kind']) ?? ''
        max = Math.max(max, STRENGTHS.indexOf(KIND_STRENGTH[kind] ?? 'weak'))
      }
      if (max >= 0 && given > max)
        bad(
          ref.file,
          `evidence line is ${STRENGTHS[given]}, but its evidence kinds allow at most ${STRENGTHS[max]}`,
        )
      if (l['directionOfEvidenceProvided'] === 'supports')
        strongestLine = Math.max(strongestLine, max >= 0 ? Math.min(given, max) : given)
    }
    const top = rank(data['strength'])
    if (top !== undefined && strongestLine < 0)
      bad(ref.file, `strength ${STRENGTHS[top]} has no supporting evidence line`)
    else if (top !== undefined && top > strongestLine)
      bad(
        ref.file,
        `strength ${STRENGTHS[top]} is above its strongest supporting evidence line (${STRENGTHS[strongestLine]})`,
      )

    for (const line of (data['hasEvidenceLines'] as unknown[] | undefined) ?? []) {
      for (const link of (obj(line)['hasEvidenceItems'] as unknown[] | undefined) ?? []) {
        const target = corpus.resolve(ref.file, link)
        if (target === undefined || target.type !== 'study-results')
          bad(ref.file, `evidence link ${String(link)} is not a study-results record`)
        else if (
          corpus.resolve(target.file, corpus.get('study-results', target.id)?.['harness'])?.file !==
          harness.file
        )
          bad(ref.file, `evidence ${target.id} is about another harness`)
      }
    }
    if (status === 'open' && data['direction'] !== 'neutral')
      bad(ref.file, 'an open statement is neutral')
    if ((status === 'current' || status === 'disputed') && data['direction'] !== 'supports')
      bad(ref.file, `a ${status} statement must have direction supports`)

    if (subjectData['cardinality'] === 'latest') {
      const key = `${harness.file}|${subject.file}`
      const list = chains.get(key) ?? []
      const target = supersedesTarget?.file
      if (supersedes !== undefined && target === undefined && !supersedesReported)
        bad(ref.file, `supersedes ${String(supersedes)}, which does not name a statement`)
      list.push({
        file: ref.file,
        status,
        target,
        broken: supersedes !== undefined && target === undefined,
      })
      chains.set(key, list)
    }

    if (status === 'current' || status === 'disputed') {
      const key = `${harness.file}|${subject.file}|${scope.model ?? ''}`
      const list = cells.get(key) ?? []
      list.push({ file: ref.file, scope, versioning })
      cells.set(key, list)
    }
  }
  // A latest-cardinality subject: one current statement per harness, and a superseded chain that
  // is linear: each superseded statement is replaced by exactly one other, and there are no cycles.
  for (const list of chains.values()) {
    const current = list.filter((r) => r.status === 'current' || r.status === 'disputed')
    for (const r of current.slice(1))
      bad(r.file, `a latest subject has a second current statement besides ${current[0]!.file}`)
    const replacedBy = new Map<string, string[]>()
    for (const r of list)
      if (r.target !== undefined)
        replacedBy.set(r.target, [...(replacedBy.get(r.target) ?? []), r.file])
    for (const r of list) {
      const by = replacedBy.get(r.file) ?? []
      if (r.status === 'superseded' && by.length !== 1 && !list.some((x) => x.broken))
        bad(
          r.file,
          `a superseded statement of a latest subject must be replaced by exactly one statement, found ${by.length}`,
        )
      const seen = new Set<string>()
      for (
        let at: string | undefined = r.file;
        at !== undefined;
        at = list.find((x) => x.file === at)?.target
      ) {
        if (seen.has(at)) {
          bad(r.file, 'its supersedes chain loops')
          break
        }
        seen.add(at)
      }
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
  const corpus = loadCorpus(process.argv[2] === undefined ? CORPUS_ROOT : resolve(process.argv[2]))
  const problems = [...corpus.report.errors, ...lint(corpus)]
  for (const p of problems) console.error(p)
  if (problems.length > 0) {
    console.error(`corpus: ${problems.length} problem(s)`)
    return 1
  }
  console.log(`corpus lint ok: ${corpus.report.records.get('statements')?.size ?? 0} statements`)
  return 0
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = main()
