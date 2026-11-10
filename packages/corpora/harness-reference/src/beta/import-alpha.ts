/**
 * `import-alpha`: convert the alpha corpus into beta records, for the categories asked for.
 *
 *   alpha sources and notes -> documents      alpha probes       -> methods
 *   alpha observations      -> study-results  alpha facts        -> statements
 *   alpha subjects          -> subjects
 *
 * Output is deterministic and idempotent: the same alpha and beta give the same files, and a
 * second run writes nothing new. A document already in beta (same URL) is reused, and a subject
 * record already in beta is never rewritten, so a hand-tuned `valueSchema` survives.
 *
 * Every method, study result and statement written carries `imported_from`, the alpha identity it
 * came from. That field, not the body text, says the importer owns the record. Names are assigned
 * over the whole alpha corpus in one fixed order, whatever categories were asked for, so importing
 * categories one by one gives the names an import of all of them gives. A record keeps its file
 * name while its identity stands; a name held by any other record is never reused; an owned
 * record in the selected categories whose identity no longer exists is deleted.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

import { fold } from '@osdlc/corpus-schema'

import { type Dataset, load, parseConcept, ROOT } from '../alpha/load.ts'
import type { Observation, Probe, Subject } from '../alpha/schema.ts'
import {
  BETA,
  type Beta,
  canonicalJson,
  createdBy,
  KIND_STRENGTH,
  link,
  loadBeta,
  normalizeUrl,
  record,
  type Strength,
  STRENGTHS,
} from './corpus.ts'
import { compareScopes, type Versioning } from './versions.ts'

export const IMPORTER = 'harness-reference import'
const REPO_BLOB = 'https://github.com/osdlc/skillwright/blob/main/'
const NOTES_PREFIX = `${REPO_BLOB}harness-reference/corpora/alpha/sources/`

/**
 * Subjects whose alpha facts record one observation per sighting, so the beta record keeps only
 * the latest as current. Seeds the `cardinality` field of a new subject record; from then on the
 * record's field decides.
 */
const LATEST_SEEDS = new Set(['meta/version-seen'])

export interface Source {
  title: string
  description?: string
}

export interface Context {
  dataset: Dataset
  beta: Beta
  /** Alpha categories to import. */
  categories: Set<string>
  /** The research note at a repository URL, when `url` names one. */
  note: (url: string) => Source | undefined
  /** The body of `probes/<id>/probe.md`. */
  probeBody: (id: string) => string
  /** The files under `probes/<id>/fixture/`, relative to it. */
  fixtureFiles: (id: string) => string[]
}

export interface Plan {
  /** Corpus-relative path -> file text. */
  files: Map<string, string>
  /** Corpus-relative path -> source file to copy, for method fixtures. */
  copies: Map<string, string>
  /** Owned records (a file, or a method's folder) the import retires, corpus-relative. */
  removed: string[]
  warnings: string[]
  counts: Record<string, number>
}

// ---- names and files ------------------------------------------------------------------------

/** A record id from free text: no character the spec forbids, no edge spaces or dots. */
export function idSafe(text: string): string {
  return (
    text
      .replace(/[/\\:*?"<>|[\]#^]/gu, ' ')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f]/gu, ' ')
      .replace(/\s+/gu, ' ')
      .replace(/^[ .]+|[ .]+$/gu, '')
  )
}

/** Claims unique ids: the first caller of a folded name keeps it, later ones get a number. */
class Names {
  private readonly taken = new Set<string>()
  constructor(existing: Iterable<string> = []) {
    for (const id of existing) this.taken.add(fold(id))
  }
  has(id: string): boolean {
    return this.taken.has(fold(id))
  }
  /** Hold `id` exactly as it is. */
  pin(id: string): void {
    this.taken.add(fold(id))
  }
  claim(wanted: string): string {
    let id = wanted
    for (let n = 2; this.taken.has(fold(id)); n++) id = `${wanted} ${n}`
    this.taken.add(fold(id))
    return id
  }
}

// ---- identities -----------------------------------------------------------------------------

/**
 * The alpha identity of what a record was made from. A fact is told apart by subject and harness;
 * a statement by the scope it covers, so a changed range is a new identity.
 */
const factKey = (f: { subject: string; harness: string }): string =>
  `fact:${f.subject}@${f.harness}`
const scopeKey = (o: Observation): string => JSON.stringify([o.since, o.until, o.model ?? null])
export const resultIdentity = (f: { subject: string; harness: string }, n: number): string =>
  `${factKey(f)}#observation-${n}`
export const statementIdentity = (
  f: { subject: string; harness: string },
  o: Observation,
): string => `${factKey(f)}#scope-${scopeKey(o)}`
export const openIdentity = (f: { subject: string; harness: string }): string =>
  `${factKey(f)}#open`
export const methodIdentity = (probe: string): string => `probe:${probe}`

/** The alpha category an identity belongs to, or undefined for a probe. */
const categoryOf = (identity: string): string | undefined =>
  /^fact:([^/@#]+)\//u.exec(identity)?.[1]

// ---- values ---------------------------------------------------------------------------------

const same = (a: unknown, b: unknown): boolean => canonicalJson(a) === canonicalJson(b)

const jsonType = (v: unknown): string =>
  v === null
    ? 'null'
    : Array.isArray(v)
      ? 'array'
      : typeof v === 'number'
        ? Number.isInteger(v)
          ? 'integer'
          : 'number'
        : typeof v

/** A permissive object schema for the values seen: each key with the types it has held. */
export function inferValueSchema(values: Record<string, unknown>[]): Record<string, unknown> {
  const keys = new Map<string, Set<string>>()
  const items = new Map<string, Set<string>>()
  for (const value of values)
    for (const [key, v] of Object.entries(value)) {
      const types = keys.get(key) ?? new Set<string>()
      types.add(jsonType(v))
      keys.set(key, types)
      if (Array.isArray(v)) {
        const it = items.get(key) ?? new Set<string>()
        for (const x of v) it.add(jsonType(x))
        items.set(key, it)
      }
    }
  const properties: Record<string, unknown> = {}
  for (const key of [...keys.keys()].sort()) {
    const types = [...(keys.get(key) ?? [])].sort()
    const prop: Record<string, unknown> = { type: types.length === 1 ? types[0] : types }
    const it = [...(items.get(key) ?? [])].sort()
    if (it.length > 0) prop['items'] = { type: it.length === 1 ? it[0] : it }
    properties[key] = prop
  }
  return { type: 'object', properties, additionalProperties: true }
}

// ---- the plan -------------------------------------------------------------------------------

const hostOf = (url: string): string => {
  try {
    return new URL(url).host.replace(/^www\./u, '')
  } catch {
    return 'web'
  }
}
const isNote = (url: string): boolean => url.startsWith(NOTES_PREFIX)

export function plan(ctx: Context): Plan {
  const { dataset, beta } = ctx
  const out: Plan = {
    files: new Map(),
    copies: new Map(),
    removed: [],
    warnings: [],
    counts: {},
  }
  const count = (k: string, n = 1): void => void (out.counts[k] = (out.counts[k] ?? 0) + n)
  const selected = (category: string | undefined): boolean =>
    category !== undefined && ctx.categories.has(category)

  const harnessBySlug = new Map<string, { id: string; file: string; versioning: Versioning }>()
  for (const { ref, data } of beta.all('harnesses'))
    harnessBySlug.set(String(data['slug']), {
      id: ref.id,
      file: ref.file,
      versioning: data['versioning'] as Versioning,
    })

  // Every fact, in one fixed order, so names do not depend on which categories were asked for.
  // Only the selected categories' records are written.
  // Alpha forbids a version range on an `unknown` versioning, so a stray one is dropped here, and
  // the statement body says so.
  const dropped = new Map<object, string[]>()
  const allFacts = [...dataset.facts]
    .sort((a, b) => (a.conceptId < b.conceptId ? -1 : a.conceptId > b.conceptId ? 1 : 0))
    .map((f) => {
      const h = harnessBySlug.get(f.harness)
      if (h === undefined || h.versioning !== 'unknown') return f
      const notes: string[] = []
      const observations = f.observations.map((o) => {
        if (o.since === null && o.until === null) return o
        const parts = [
          ...(o.since === null ? [] : [`since: ${o.since}`]),
          ...(o.until === null ? [] : [`until: ${o.until}`]),
        ]
        notes.push(
          `Dropped \`${parts.join(', ')}\` from the ${o.observed} observation: ${h.id} has no known versioning.`,
        )
        return { ...o, since: null, until: null }
      })
      const fact = { ...f, observations }
      if (notes.length > 0) dropped.set(fact, notes)
      return fact
    })
  // An existing subject record decides (no field means one); a seed applies only to a subject
  // with no record yet.
  const latest = new Set<string>()
  const recorded = new Set<string>()
  for (const { data } of beta.all('subjects')) {
    recorded.add(String(data['slug']))
    if (data['cardinality'] === 'latest') latest.add(String(data['slug']))
  }
  for (const slug of LATEST_SEEDS) if (!recorded.has(slug)) latest.add(slug)
  /** A latest-cardinality fact has one statement per sighting; any other, one per scope. */
  const stmtIdentity = (
    f: { subject: string; harness: string },
    o: Observation,
    n: number,
  ): string => (latest.has(f.subject) ? `${factKey(f)}#sighting-${n}` : statementIdentity(f, o))
  const factSelected = (f: { subject: string }): boolean => selected(f.subject.split('/')[0])
  const subjectById = new Map(dataset.subjects.map((s) => [s.id, s]))

  // ---- ownership: the records this importer wrote earlier, by alpha identity ----
  interface Owned {
    type: string
    id: string
    file: string
  }
  const owned = new Map<string, Owned>()
  const ownedFiles = new Set<string>()
  for (const type of ['methods', 'study-results', 'statements'])
    for (const { ref, data } of beta.all(type)) {
      const from = data['imported_from']
      if (typeof from !== 'string') continue
      const first = owned.get(from)
      if (first !== undefined)
        throw new Error(`${first.file} and ${ref.file} both claim imported_from "${from}"`)
      owned.set(from, { type, id: ref.id, file: ref.file })
      ownedFiles.add(ref.file)
    }

  const probeIds = new Set<string>()
  const selectedProbeIds = new Set<string>()
  const identities = new Set<string>()
  for (const f of allFacts) {
    // Only facts the import can write: a fact it skips leaves its old records to be retired.
    if (!harnessBySlug.has(f.harness) || !subjectById.has(f.subject)) continue
    f.observations.forEach((o, i) => {
      identities.add(resultIdentity(f, i + 1))
      identities.add(stmtIdentity(f, o, i + 1))
      if (o.probe !== undefined) {
        probeIds.add(o.probe)
        if (factSelected(f)) selectedProbeIds.add(o.probe)
      }
    })
    if (f.observations.length === 0 && (f.open ?? []).length > 0) identities.add(openIdentity(f))
  }
  for (const id of probeIds) identities.add(methodIdentity(id))

  // An owned record whose identity stands keeps its name. One in the selected categories whose
  // identity is gone is retired. Every other record keeps its name reserved.
  const pinned = new Map<string, string>()
  const retired = new Set<string>()
  const reserved = new Map<string, Set<string>>()
  const hold = (type: string, id: string): void => {
    const set = reserved.get(type) ?? new Set<string>()
    set.add(id)
    reserved.set(type, set)
  }
  for (const type of ['methods', 'study-results', 'statements', 'subjects', 'documents'])
    for (const { ref } of beta.all(type)) if (!ownedFiles.has(ref.file)) hold(type, ref.id)
  for (const [identity, rec] of owned) {
    const probe = identity.startsWith('probe:') ? identity.slice(6) : undefined
    const inScope = probe === undefined ? selected(categoryOf(identity)) : !probeIds.has(probe)
    if (identities.has(identity)) {
      const folder = posix.dirname(rec.file)
      const inPlace =
        rec.type === 'methods'
          ? rec.file === `methods/${rec.id}/${rec.id}.md`
          : [...harnessBySlug.values()].some((h) => folder === `${rec.type}/${h.id}`)
      const rewritten = probe === undefined ? inScope : selectedProbeIds.has(probe)
      if (inPlace) pinned.set(identity, rec.id)
      else if (rewritten) retired.add(rec.file)
      else hold(rec.type, rec.id)
    } else if (inScope) retired.add(rec.file)
    else hold(rec.type, rec.id)
  }
  // A method no alpha fact names is still kept while a surviving study result is specified by it.
  const specifying = new Set<string>()
  for (const { ref, data } of beta.all('study-results'))
    if (!retired.has(ref.file)) {
      const m = beta.resolve(ref.file, data['specifiedBy'])
      if (m !== undefined) specifying.add(m.file)
    }
  for (const [identity, rec] of owned)
    if (identity.startsWith('probe:') && retired.has(rec.file) && specifying.has(rec.file)) {
      retired.delete(rec.file)
      hold(rec.type, rec.id)
    }
  const namesFor = (type: string): Names => {
    const names = new Names(reserved.get(type) ?? [])
    for (const [identity, rec] of owned)
      if (rec.type === type && pinned.has(identity)) names.pin(rec.id)
    return names
  }
  const nameFor = (identity: string, names: Names, wanted: string): string =>
    pinned.get(identity) ?? names.claim(wanted)

  // Subjects. An existing record is kept as it is.
  const subjectNames = namesFor('subjects')
  const subjectFile = new Map<string, string>()
  for (const { ref, data } of beta.all('subjects')) subjectFile.set(String(data['slug']), ref.file)
  for (const s of [...dataset.subjects].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (subjectFile.has(s.id)) continue
    const id = subjectNames.claim(idSafe(s.title))
    if (!selected(s.category)) continue
    const file = `subjects/${s.category}/${id}.md`
    subjectFile.set(s.id, file)
    const seen = dataset.facts
      .filter((f) => f.subject === s.id)
      .flatMap((f) => f.observations.map((o) => o.value))
    out.files.set(
      file,
      record(
        {
          slug: s.id,
          category: s.category,
          description: s.description,
          ...(s.model_dependent === true ? { model_dependent: true } : {}),
          ...(LATEST_SEEDS.has(s.id) ? { cardinality: 'latest' } : {}),
          valueSchema: inferValueSchema(seen),
        },
        '',
      ),
    )
    count('subjects')
  }

  // Documents: reuse a beta document with the same URL, else add one. Documents are shared
  // between categories, so they are never retired.
  const docByUrl = new Map<string, string>()
  const docNames = namesFor('documents')
  for (const { ref, data } of beta.all('documents'))
    for (const u of (data['urls'] as string[]) ?? []) docByUrl.set(normalizeUrl(u), ref.file)
  const newDocs = new Map<string, string>()
  const wantedDocs = new Set<string>()
  const documentFor = (url: string, title: string, emit: boolean): string => {
    const known = docByUrl.get(normalizeUrl(url))
    if (known !== undefined) {
      if (emit && newDocs.has(known)) wantedDocs.add(known)
      return known
    }
    const note = isNote(url) ? ctx.note(url) : undefined
    const host = isNote(url) ? 'skillwright' : hostOf(url)
    const docTitle = note?.title ?? title
    let id = idSafe(docTitle)
    if (id === '') id = host
    // Name taken by another URL: qualify it with the publisher.
    id = docNames.has(id) ? docNames.claim(`${id} ${host}`) : docNames.claim(id)
    const file = `documents/${host}/${id}.md`
    docByUrl.set(normalizeUrl(url), file)
    newDocs.set(
      file,
      record(
        {
          title: docTitle,
          ...(isNote(url) ? { documentType: 'research note' } : {}),
          urls: [url],
          publisher: host,
        },
        note?.description ?? '',
      ),
    )
    if (emit) wantedDocs.add(file)
    return file
  }

  // Methods: the probes that imported run observations name.
  const methodFile = new Map<string, string>()
  const methodNames = namesFor('methods')
  for (const id of [...probeIds].sort()) {
    const p = dataset.probes.find((x) => x.id === id)
    if (p === undefined) continue
    const name = nameFor(methodIdentity(id), methodNames, idSafe(p.title))
    methodFile.set(id, `methods/${name}/${name}.md`)
  }
  for (const [id, file] of [...methodFile].sort()) {
    if (!selectedProbeIds.has(id)) continue
    const p = dataset.probes.find((x) => x.id === id) as Probe
    const harnesses = p.harnesses
      .map((h) => harnessBySlug.get(h))
      .filter((h) => h !== undefined)
      .map((h) => link(file, h.file, h.id))
    for (const h of p.harnesses)
      if (!harnessBySlug.has(h)) out.warnings.push(`probe ${id}: harness ${h} has no beta record`)
    const subs = p.subjects
      .map((s) => subjectFile.get(s))
      .filter((s): s is string => s !== undefined)
      .map((s) => link(file, s))
    let fixture = ctx.fixtureFiles(id)
    const nested = fixture.some((f) => {
      const parts = f.split('/')
      const name = parts.at(-1) ?? ''
      const parent = parts.at(-2)
      return parent !== undefined && ['.md', '.yaml', '.json'].some((e) => name === parent + e)
    })
    if (nested) {
      out.warnings.push(`probe ${id}: fixture holds a record-folder shape, so it was not copied`)
      fixture = []
    }
    for (const f of fixture)
      out.copies.set(`${posix.dirname(file)}/fixture/${f}`, `${id}/fixture/${f}`)
    const body = `${ctx.probeBody(id).trim()}\n\nImported from \`probes/${id}/probe.md\`.${fixture.length > 0 ? ' The fixture files are in [fixture](fixture).' : ''}`
    out.files.set(
      file,
      record(
        {
          methodType: 'probe',
          harnesses,
          ...(subs.length > 0 ? { subjects: subs } : {}),
          commands: p.commands,
          record: p.record,
          safety: p.safety,
          imported_from: methodIdentity(id),
        },
        body,
      ),
    )
    count('methods')
  }

  // Study results and statements, fact by fact.
  const resultNames = namesFor('study-results')
  const statementNames = namesFor('statements')
  for (const fact of allFacts) {
    const emit = factSelected(fact)
    const h = harnessBySlug.get(fact.harness)
    const subject = subjectById.get(fact.subject) as Subject | undefined
    const sfile = subjectFile.get(fact.subject)
    const alphaPath = `${fact.conceptId}.md`
    if (h === undefined || subject === undefined || (emit && sfile === undefined)) {
      if (emit) {
        const missing =
          h === undefined
            ? `harness ${fact.harness} has no beta record`
            : subject === undefined
              ? `subject ${fact.subject} is not in the alpha corpus`
              : `subject ${fact.subject} has no beta record`
        out.warnings.push(`${alphaPath}: ${missing}; not imported`)
        count('facts skipped')
      }
      continue
    }
    const open = (fact.open ?? []).map((q) => q.question)
    if (fact.observations.length === 0 && open.length === 0) {
      if (emit) {
        out.warnings.push(`${alphaPath}: no observations and no open questions; not imported`)
        count('facts skipped')
      }
      continue
    }
    const versioning = h.versioning
    const sourceUrl = new Map(fact.sources.map((s) => [s.id, s]))
    const docFor = (sid: string): string => {
      const s = sourceUrl.get(sid) as { resource: string; title: string }
      return documentFor(s.resource, s.title, emit)
    }

    // One study result per observation.
    interface Made {
      obs: Observation
      index: number
      file: string
      kind: string
    }
    const made: Made[] = []
    fact.observations.forEach((o, i) => {
      const s = sourceUrl.get(o.source)
      const kind = o.evidence ?? (s !== undefined && isNote(s.resource) ? 'third-party' : 'docs')
      const identity = resultIdentity(fact, i + 1)
      const name = nameFor(identity, resultNames, idSafe(`${o.observed} ${h.id} ${subject.title}`))
      const file = `study-results/${h.id}/${name}.md`
      const reported = [
        ...new Set([docFor(o.source), ...(o.via === undefined ? [] : [docFor(o.via)])]),
      ]
      made.push({ obs: o, index: i, file, kind })
      if (!emit) return
      const method = o.probe === undefined ? undefined : methodFile.get(o.probe)
      const lines = [
        `Imported from \`${alphaPath}\`, observation ${i + 1}.`,
        '',
        ...Object.entries(o.value).map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`),
        ...(o.model === undefined ? [] : ['', `Model: ${o.model}.`]),
        ...(o.note === undefined ? [] : ['', o.note]),
      ]
      out.files.set(
        file,
        record(
          {
            kind,
            ...(method === undefined ? {} : { specifiedBy: link(file, method) }),
            reportedIn: reported.map((d) => link(file, d)),
            harness: link(file, h.file, h.id),
            ...(o.checked_version === undefined
              ? {}
              : { version: o.checked_version, version_basis: 'exact' }),
            observed: o.observed,
            ...(o.locator === undefined ? {} : { locator: o.locator }),
            contributions: [createdBy(IMPORTER, 'software', o.observed)],
            imported_from: identity,
          },
          lines.join('\n'),
        ),
      )
      count('study-results')
    })

    // A latest-cardinality subject: one statement per sighting, oldest first. The newest is
    // current; each older one is superseded and linked from the one that replaced it.
    if (latest.has(fact.subject) && fact.observations.length > 0) {
      const chain = [...made].sort(
        (a, b) =>
          (a.obs.observed < b.obs.observed ? -1 : a.obs.observed > b.obs.observed ? 1 : 0) ||
          a.index - b.index,
      )
      const files = chain.map((m) => {
        const wanted = idSafe(
          `${h.id} ${subject.title} ${String(m.obs.value['version'] ?? m.obs.observed)}`,
        )
        return `statements/${h.id}/${nameFor(stmtIdentity(fact, m.obs, m.index + 1), statementNames, wanted)}.md`
      })
      if (emit)
        chain.forEach((m, i) => {
          const file = files[i] as string
          const isLast = i === chain.length - 1
          const prev = files[i - 1]
          const strength = KIND_STRENGTH[m.kind] ?? 'weak'
          out.files.set(
            file,
            record(
              {
                proposition: {
                  subject: link(file, h.file, h.id),
                  predicate: fact.subject,
                  object: { ...m.obs.value, observed: m.obs.observed },
                },
                direction: 'supports',
                strength,
                hasEvidenceLines: [
                  {
                    hasEvidenceItems: [link(file, m.file)],
                    directionOfEvidenceProvided: 'supports',
                    strengthOfEvidenceProvided: strength,
                    description: `${m.kind} observed ${m.obs.observed}.`,
                  },
                ],
                reportedIn: [docFor(m.obs.source)].map((d) => link(file, d)),
                contributions: [createdBy(IMPORTER, 'software', m.obs.observed)],
                harness: link(file, h.file, h.id),
                subject: link(file, sfile as string),
                scope: { since: null, until: null, platform: [], model: null },
                status: isLast ? 'current' : 'superseded',
                ...(prev === undefined ? {} : { supersedes: link(file, prev) }),
                ...(isLast && open.length > 0 ? { open } : {}),
                imported_from: stmtIdentity(fact, m.obs, m.index + 1),
              },
              [
                `Imported from \`${alphaPath}\`, observation ${m.index + 1}.`,
                '',
                'The latest sighting is the current statement; an older one is superseded by the next.',
                ...(dropped.has(fact) ? ['', ...(dropped.get(fact) as string[])] : []),
                ...(isLast && open.length > 0
                  ? ['', 'Open questions:', ...open.map((q) => `- ${q}`)]
                  : []),
              ].join('\n'),
            ),
          )
          count('statements')
          count(`statements ${isLast ? 'current' : 'superseded'}`)
        })
      if (emit) count('facts')
      continue
    }

    // One statement per distinct scope.
    const groups = new Map<string, Made[]>()
    for (const m of made) groups.set(scopeKey(m.obs), [...(groups.get(scopeKey(m.obs)) ?? []), m])
    const ordered = [...groups.values()].sort((a, b) =>
      compareScopes(
        { since: a[0]!.obs.since, model: a[0]!.obs.model ?? null },
        { since: b[0]!.obs.since, model: b[0]!.obs.model ?? null },
        versioning,
      ),
    )
    const statementFiles = new Map<string, string>()
    // Names first, so a superseding statement can link the older one.
    for (const g of ordered) {
      const o = g[0]!.obs
      const suffix = [
        o.since !== null ? ` from ${o.since}` : '',
        o.until !== null ? ` until ${o.until}` : '',
        o.model !== undefined ? ` on ${o.model}` : '',
      ].join('')
      const name = nameFor(
        statementIdentity(fact, o),
        statementNames,
        idSafe(`${h.id} ${subject.title}${suffix}`),
      )
      statementFiles.set(scopeKey(o), `statements/${h.id}/${name}.md`)
    }
    if (emit)
      ordered.forEach((g, gi) => {
        const o0 = g[0]!.obs
        const file = statementFiles.get(scopeKey(o0)) as string
        // The latest observation wins; a tie goes to the later one in the alpha file.
        const byDate = [...g].sort(
          (a, b) =>
            (a.obs.observed < b.obs.observed ? -1 : a.obs.observed > b.obs.observed ? 1 : 0) ||
            a.index - b.index,
        )
        const merged: Record<string, unknown> = {}
        const conflicts = new Set<string>()
        for (const m of byDate)
          for (const [k, v] of Object.entries(m.obs.value)) {
            if (k in merged && !same(merged[k], v)) conflicts.add(k)
            merged[k] = v
          }
        const lines = g.map((m) => {
          const disputes = [...conflicts].some(
            (k) => k in m.obs.value && !same(m.obs.value[k], merged[k]),
          )
          return {
            hasEvidenceItems: [link(file, m.file)],
            directionOfEvidenceProvided: disputes ? 'disputes' : 'supports',
            strengthOfEvidenceProvided: KIND_STRENGTH[m.kind] ?? 'weak',
            description: `${m.kind} observed ${m.obs.observed}${disputes ? '; its value differs from the latest' : ''}.`,
          }
        })
        const supporting = lines.filter((l) => l.directionOfEvidenceProvided === 'supports')
        let best = Math.max(
          ...supporting.map((l) => STRENGTHS.indexOf(l.strengthOfEvidenceProvided as Strength)),
        )
        if (supporting.length < lines.length) best = Math.max(0, best - 1)
        const status =
          o0.until !== null ? 'superseded' : conflicts.size > 0 ? 'disputed' : 'current'
        const prior =
          o0.since === null
            ? undefined
            : ordered.find(
                (p) =>
                  p[0]!.obs.until === o0.since && (p[0]!.obs.model ?? null) === (o0.model ?? null),
              )
        const last = gi === ordered.length - 1
        const date = byDate.at(-1)!.obs.observed
        const sources = [...new Set(g.map((m) => m.obs.source))].map(docFor)
        const body = [
          `Imported from \`${alphaPath}\`.`,
          ...(dropped.has(fact) ? ['', ...(dropped.get(fact) as string[])] : []),
          ...(conflicts.size > 0
            ? [
                '',
                `The observations disagree on: ${[...conflicts].sort().join(', ')}. The latest value is kept.`,
              ]
            : []),
          ...(last && open.length > 0 ? ['', 'Open questions:', ...open.map((q) => `- ${q}`)] : []),
        ].join('\n')
        out.files.set(
          file,
          record(
            {
              proposition: {
                subject: link(file, h.file, h.id),
                predicate: fact.subject,
                object: merged,
              },
              direction: 'supports',
              strength: STRENGTHS[best],
              hasEvidenceLines: lines,
              reportedIn: sources.map((d) => link(file, d)),
              contributions: [createdBy(IMPORTER, 'software', date)],
              harness: link(file, h.file, h.id),
              subject: link(file, sfile as string),
              scope: { since: o0.since, until: o0.until, platform: [], model: o0.model ?? null },
              status,
              ...(prior === undefined
                ? {}
                : {
                    supersedes: link(file, statementFiles.get(scopeKey(prior[0]!.obs)) as string),
                  }),
              ...(last && open.length > 0 ? { open } : {}),
              imported_from: statementIdentity(fact, o0),
            },
            body,
          ),
        )
        count('statements')
        count(`statements ${status}`)
      })

    // A fact with only open questions is one open statement.
    if (fact.observations.length === 0) {
      const identity = openIdentity(fact)
      const name = nameFor(identity, statementNames, idSafe(`${h.id} ${subject.title} open`))
      const file = `statements/${h.id}/${name}.md`
      const date = (fact.open ?? [])
        .map((q) => q.observed)
        .sort()
        .at(-1) as string
      // Documents are named for every fact, written or not, so names do not depend on the run.
      const openDocs = [...new Set((fact.open ?? []).map((q) => q.source))].map(docFor)
      if (emit) {
        out.files.set(
          file,
          record(
            {
              proposition: {
                subject: link(file, h.file, h.id),
                predicate: fact.subject,
                object: { open },
              },
              direction: 'neutral',
              reportedIn: openDocs.map((d) => link(file, d)),
              contributions: [createdBy(IMPORTER, 'software', date)],
              harness: link(file, h.file, h.id),
              subject: link(file, sfile as string),
              scope: { since: null, until: null, platform: [], model: null },
              status: 'open',
              open,
              imported_from: identity,
            },
            [
              `Imported from \`${alphaPath}\`.`,
              '',
              'Open questions:',
              ...open.map((q) => `- ${q}`),
            ].join('\n'),
          ),
        )
        count('statements')
        count('statements open')
      }
    }
    if (emit) count('facts')
  }

  for (const file of wantedDocs) {
    out.files.set(file, newDocs.get(file) as string)
    count('documents')
  }

  // Retire what is owned, in scope and no longer written. A method goes with its folder.
  const written = [...out.files.keys()]
  for (const file of [...retired].sort()) {
    const method = file.startsWith('methods/')
    const target = method ? posix.dirname(file) : file
    if (!written.some((w) => w === target || w.startsWith(`${target}/`))) out.removed.push(target)
  }
  return out
}

// ---- disk -----------------------------------------------------------------------------------

/** What a plan would do to a corpus on disk. All paths are corpus-relative. */
export interface Diff {
  /** Files that do not exist yet. */
  add: string[]
  /** Existing files whose text differs from what the plan writes. */
  overwrite: string[]
  /** Records the plan retires. */
  remove: string[]
}

export function diffPlan(root: string, p: Plan): Diff {
  const add: string[] = []
  const overwrite: string[] = []
  const check = (rel: string, same: (file: string) => boolean): void => {
    const file = join(root, rel)
    if (!existsSync(file)) add.push(rel)
    else if (!same(file)) overwrite.push(rel)
  }
  for (const [rel, text] of [...p.files].sort(([a], [b]) => (a < b ? -1 : 1)))
    check(rel, (file) => readFileSync(file, 'utf8') === text)
  for (const [rel, from] of [...p.copies].sort(([a], [b]) => (a < b ? -1 : 1)))
    check(rel, (file) => readFileSync(file).equals(readFileSync(from)))
  return {
    add,
    overwrite,
    remove: existsSync(root) ? p.removed.filter((r) => existsSync(join(root, r))) : [],
  }
}

/**
 * Write the plan under `root`. By default only files that do not exist yet are written: an
 * existing file is never touched, and nothing is removed. With `force`, every file is written
 * and every retired record removed. Returns the paths written.
 */
export function writePlan(root: string, p: Plan, options: { force?: boolean } = {}): string[] {
  const force = options.force === true
  const d = diffPlan(root, p)
  const todo = new Set(force ? [...d.add, ...d.overwrite] : d.add)
  const changed: string[] = []
  for (const [rel, text] of [...p.files].sort(([a], [b]) => (a < b ? -1 : 1)))
    if (todo.has(rel)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true })
      writeFileSync(join(root, rel), text)
      changed.push(rel)
    }
  for (const [rel, from] of [...p.copies].sort(([a], [b]) => (a < b ? -1 : 1)))
    if (todo.has(rel)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true })
      copyFileSync(from, join(root, rel))
      changed.push(rel)
    }
  if (force) for (const rel of p.removed) rmSync(join(root, rel), { recursive: true, force: true })
  return changed
}

const walkFiles = (dir: string, base = ''): string[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .sort()
        .flatMap((n) => {
          const full = join(dir, n)
          return statSync(full).isDirectory() ? walkFiles(full, `${base}${n}/`) : [`${base}${n}`]
        })
    : []

/**
 * The research note a repository URL names, as a path under `sources`: the part after the notes
 * prefix, without query or fragment, decoded. Anything that leaves the folder is not a note.
 */
export function notePath(url: string, sources: string): string | undefined {
  if (!isNote(url)) return undefined
  let rel = url.slice(NOTES_PREFIX.length).replace(/[?#].*$/su, '')
  try {
    rel = decodeURIComponent(rel)
  } catch {
    return undefined
  }
  const parts = rel.split('/')
  if (rel === '' || parts.some((x) => x === '' || x === '.' || x === '..' || x.includes('\\')))
    return undefined
  return join(sources, ...parts)
}

export function defaultContext(
  categories: Set<string>,
  betaRoot: string = BETA,
  dataset: Dataset = loadDataset(),
): Context {
  const probes = join(ROOT, 'probes')
  return {
    dataset,
    beta: loadBeta(betaRoot),
    categories,
    note: (url) => {
      const file = notePath(url, join(ROOT, 'corpora/alpha/sources'))
      if (file === undefined || !existsSync(file)) return undefined
      const fm = parseConcept(readFileSync(file, 'utf8')).frontmatter as Record<string, unknown>
      return {
        title: String(fm['title']),
        ...(typeof fm['description'] === 'string' ? { description: fm['description'] } : {}),
      }
    },
    probeBody: (id) => parseConcept(readFileSync(join(probes, id, 'probe.md'), 'utf8')).body,
    fixtureFiles: (id) => walkFiles(join(probes, id, 'fixture')),
  }
}

function loadDataset(): Dataset {
  const { dataset, errors } = load()
  if (dataset === null || errors.length > 0)
    throw new Error(`the alpha corpus has errors:\n${errors.join('\n')}`)
  return dataset
}

/**
 * Plan the import and compare it with the corpus. It writes only when asked: `write` adds files
 * that do not exist yet, `force` also overwrites and removes.
 */
export function importAlpha(
  categories: Set<string>,
  betaRoot: string = BETA,
  dataset?: Dataset,
  options: { write?: boolean; force?: boolean } = {},
): { plan: Plan; diff: Diff; changed: string[] } {
  const p = plan(defaultContext(categories, betaRoot, dataset))
  for (const [rel, from] of p.copies) p.copies.set(rel, join(ROOT, 'probes', from))
  const diff = diffPlan(betaRoot, p)
  const changed =
    options.write === true || options.force === true
      ? writePlan(betaRoot, p, { force: options.force === true })
      : []
  return { plan: p, diff, changed }
}

function main(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      category: { type: 'string', multiple: true },
      all: { type: 'boolean' },
      beta: { type: 'string' },
      write: { type: 'boolean' },
      force: { type: 'boolean' },
    },
  })
  const dataset = loadDataset()
  const known = new Set(dataset.categories.map((c) => c.id))
  const chosen = values.all === true ? known : new Set(values.category ?? [])
  const unknown = [...chosen].filter((c) => !known.has(c))
  if (chosen.size === 0 || unknown.length > 0) {
    console.error(
      `usage: import-alpha (--category <id>)... | --all [--beta <dir>] [--write | --force]\ncategories: ${[...known].join(', ')}${unknown.length > 0 ? `\nunknown: ${unknown.join(', ')}` : ''}`,
    )
    return 2
  }
  const force = values.force === true
  const {
    plan: p,
    diff,
    changed,
  } = importAlpha(chosen, values.beta === undefined ? BETA : resolve(values.beta), dataset, {
    write: values.write === true,
    force,
  })
  for (const w of p.warnings) console.warn(`warning: ${w}`)
  console.log(
    Object.entries(p.counts)
      .map(([k, n]) => `${n} ${k}`)
      .join(', '),
  )
  const written = new Set(changed)
  const removed = force ? diff.remove : []
  const left = {
    add: diff.add.filter((r) => !written.has(r)),
    overwrite: diff.overwrite.filter((r) => !written.has(r)),
    remove: diff.remove.filter((r) => !removed.includes(r)),
  }
  const verb = changed.length > 0 || removed.length > 0 ? 'wrote' : 'would write'
  for (const r of changed) console.log(`wrote ${r}`)
  for (const r of removed) console.log(`removed ${r}`)
  for (const r of left.add) console.log(`${verb === 'wrote' ? 'not written' : 'would write'}: ${r}`)
  for (const r of left.overwrite)
    console.log(`edited since import, left alone (--force overwrites): ${r}`)
  for (const r of left.remove) console.log(`would remove (needs --force): ${r}`)
  // A record that merely differs has been edited since the import, which is expected: it is
  // listed and does not fail the run.
  const pending = left.add.length + left.remove.length
  console.log(
    `${changed.length} written, ${removed.length} removed, ${pending} pending, ${left.overwrite.length} edited`,
  )
  return pending === 0 ? 0 : 1
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv.slice(2))
