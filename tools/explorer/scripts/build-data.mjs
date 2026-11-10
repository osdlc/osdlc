// Builds data/ecosystem.json and data/plan.json from the plan's records in docs/planning.
// Usage: node scripts/build-data.mjs [--corpus <dir>] [--out <dir>]
// The corpus is validated with @osdlc/corpus-schema first. Each problem, from the validator or from
// a rule it cannot check, is one line on stderr, and then nothing is written. See
// docs/planning/README.md.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { validateCorpus } from '@osdlc/corpus-schema'
import { parse } from 'yaml'

const STATES = ['present', 'target']
const EDGE_KINDS = ['depends', 'dev-depends', 'implements', 'extends', 'validates', 'reads']
// Field suffix -> the states an edge in that field exists in.
const SUFFIXES = [
  ['', ['present', 'target']],
  ['_new', ['target']],
  ['_going', ['present']],
]

const toPosix = (p) => p.split(sep).join('/')
const byKey = (key) => (a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)

/** A note's frontmatter text and body. The validator has already checked that the frontmatter parses. */
function split(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  return { frontmatter: m ? m[1] : '', body: (m ? text.slice(m[0].length) : text).replace(/\r\n/g, '\n') }
}

/** The destination of a whole-string Markdown link, `[text](dest "title")`, or null. */
function linkDest(value) {
  const m = typeof value === 'string' ? /^\[(?:\\.|[^\]\\])*\]\(([\s\S]*)\)$/.exec(value.trim()) : null
  if (m === null) return null
  const inner = m[1].trim()
  const raw = inner.startsWith('<') ? inner.slice(1, inner.indexOf('>')) : inner.split(/\s/)[0]
  return raw.replace(/\\(.)/g, '$1')
}

/**
 * A body as plain text: each paragraph and each `- ` item on one line, wrapped lines joined with a
 * space, and blank lines kept.
 */
function unwrap(body) {
  const lines = []
  let blank = true
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (line === '') lines.push('')
    else if (blank || line.startsWith('- ')) lines.push(line)
    else lines[lines.length - 1] += ` ${line}`
    blank = line === ''
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Reads and validates the corpus. Problems and `source` paths name files from `root`. */
function readCorpus(corpus, root) {
  const label = toPosix(relative(root, corpus)) || '.'
  const report = validateCorpus(corpus)
  const problems = [...report.errors, ...report.warnings].map((p) => `${label}/${p}`)
  const byPath = new Map() // corpus-relative path -> record
  const ofType = {}
  for (const [type, files] of report.files) {
    ofType[type] = []
    for (const [id, path] of files) {
      const record = {
        type,
        id,
        path,
        name: `${label}/${path}`,
        source: toPosix(relative(root, join(corpus, path))),
        data: report.records.get(type).get(id),
        body: split(readFileSync(join(corpus, path), 'utf8')).body,
      }
      byPath.set(path, record)
      ofType[type].push(record)
    }
    ofType[type].sort(byKey((r) => r.id))
  }
  for (const type of ['tasks', 'milestones', 'components', 'layers', 'repos', 'overlaps', 'datasets'])
    if (ofType[type] === undefined) problems.push(`${label}/${type}: (folder): missing type`)
  if (problems.length > 0) return { problems }
  let taskSchemas
  try {
    taskSchemas = schemaChain(corpus, 'tasks')
  } catch (e) {
    return { problems: [`${label}/tasks/tasks.schema.md: x-extends: ${e.message}`] }
  }
  return { label, problems, byPath, ofType, taskSchemas }
}

/**
 * The schemas of a type and of each type up its `x-extends` chain, nearest first. A prefix is
 * followed through the root file's `extends`, which must give a path. The validator has already
 * checked the chain.
 */
function schemaChain(corpus, type) {
  // The first of `names` in `dir`, as data: a Markdown file's frontmatter, or YAML or JSON.
  const data = (dir, names) => {
    for (const name of names) {
      let text
      try {
        text = readFileSync(join(dir, name), 'utf8')
      } catch {
        continue
      }
      return parse(name.endsWith('.md') ? split(text).frontmatter : text)
    }
    throw new Error(`no ${names.join(', ')} in ${dir}`)
  }
  const chain = []
  for (let dir = corpus, name = type; name !== undefined; ) {
    const schema = data(join(dir, name), ['.md', '.yaml', '.json'].map((ext) => `${name}.schema${ext}`))
    chain.push(schema)
    const [prefix, base] = (schema['x-extends'] ?? '').split('/', 2)
    if (base === undefined) name = prefix || undefined
    else {
      const source = data(dir, ['corpus-schema.md', 'corpus-schema.yaml', 'corpus-schema.json']).extends[prefix]
      if (!/^\.\.?\//.test(source)) throw new Error(`build-data reads a parent by path only, not ${source}`)
      dir = resolve(dir, source)
      name = base
    }
  }
  return chain
}

/** Link lookups over a validated corpus. A link that names no record of the type adds a problem. */
function linker({ byPath }, problems) {
  /** The record a link points at, or null after noting a problem. */
  const target = (record, field, value, type) => {
    const dest = linkDest(value)
    let found
    if (dest !== null)
      try {
        found = byPath.get(posix.normalize(posix.join(posix.dirname(record.path), decodeURIComponent(dest))))
      } catch {
        found = undefined
      }
    if (found === undefined || found.type !== type) {
      problems.push(`${record.name}: ${field}: ${JSON.stringify(value)} does not point at a ${type} record (dangling reference)`)
      return null
    }
    return found
  }
  const refId = (record, field, type) => {
    const value = record.data[field]
    return value === undefined ? null : (target(record, field, value, type)?.id ?? null)
  }
  const refs = (record, field, type) =>
    (record.data[field] ?? []).map((v) => target(record, field, v, type)).filter((r) => r !== null)
  return { target, refId, refs }
}

function buildPlan(corpus, problems, { refId, refs }) {
  const { ofType, label, taskSchemas } = corpus
  const tasksDir = `${label}/tasks`
  const numberOf = new Map(ofType.tasks.map((t) => [t.id, t.data.number]))
  for (const t of ofType.tasks)
    if (!t.id.startsWith(`${t.data.number} `))
      problems.push(`${t.name}: number: the file name must start with the number, ${t.data.number}`)
  const numbers = ofType.tasks.map((t) => t.data.number)
  for (const n of new Set(numbers.filter((n, i) => numbers.indexOf(n) !== i)))
    problems.push(`${tasksDir}: number: ${n} is used by more than one task`)
  const toNumber = (r) => numberOf.get(r.id)

  const milestones = [...ofType.milestones].sort(byKey((m) => m.data.order))
  const listedIn = new Map() // task number -> ids of the milestones that list it
  for (const m of milestones)
    for (const n of refs(m, 'tasks', 'tasks').map(toNumber)) listedIn.set(n, [...(listedIn.get(n) ?? []), m.id])

  const tasks = [...ofType.tasks].sort(byKey((t) => t.data.number)).map((t) => {
    const milestone = refId(t, 'milestone', 'milestones')
    const lists = listedIn.get(t.data.number) ?? []
    if (milestone !== null && (lists.length !== 1 || lists[0] !== milestone))
      problems.push(`${t.name}: milestone: ${milestone} must list this task once under tasks; listed in ${lists.join(', ') || 'none'}`)
    return {
      id: t.data.number,
      title: t.data.title,
      detail: t.data.detail,
      status: t.data.status,
      milestone,
      type: t.data.type,
      after: refs(t, 'after', 'tasks').map(toNumber).sort((a, b) => a - b),
      text: unwrap(t.body),
      source: t.source,
    }
  })

  const afterOf = new Map(tasks.map((t) => [t.id, t.after]))
  const state = new Map()
  const visit = (n, path) => {
    if (state.get(n) === 'done') return
    if (state.get(n) === 'open') {
      problems.push(`${tasksDir}: after: cycle ${[...path, n].join(' -> ')}`)
      return
    }
    state.set(n, 'open')
    for (const a of afterOf.get(n) ?? []) visit(a, [...path, n])
    state.set(n, 'done')
  }
  for (const t of tasks) visit(t.id, [])

  // Done when every task is done; in progress when any is in progress or done.
  const statusOf = new Map(tasks.map((t) => [t.id, t.status]))
  const milestoneStatus = (ids) => {
    const states = new Set(ids.map((n) => statusOf.get(n)))
    if (states.size > 0 && [...states].every((s) => s === 'done')) return 'done'
    return states.has('doing') || states.has('done') ? 'doing' : 'todo'
  }
  // The nearest schema that gives the field its values: `status` comes from the profile.
  const labels = (field) =>
    taskSchemas.find((s) => s.properties?.[field]?.oneOf).properties[field].oneOf.map((v) => ({ id: v.const, label: v.title }))

  return {
    asOf: ofType.datasets.find((d) => d.id === 'plan')?.data.as_of,
    statuses: labels('status'),
    types: labels('type'),
    milestones: milestones.map((m) => {
      const ids = refs(m, 'tasks', 'tasks').map(toNumber)
      return {
        id: m.id,
        title: m.data.title,
        goal: unwrap(m.body),
        status: milestoneStatus(ids),
        beeline: m.data.beeline === true,
        tasks: ids,
        source: m.source,
      }
    }),
    tasks,
  }
}

/** A component's body: its purpose, then the items of a `## Notes` section. */
function purposeAndNotes(c, problems) {
  const [purpose, ...sections] = c.body.split(/^## /m)
  const notes = []
  for (const section of sections) {
    const [heading, ...rest] = section.split('\n')
    if (heading.trim() !== 'Notes') {
      problems.push(`${c.name}: body: unknown section "## ${heading.trim()}"; only "## Notes" is read`)
      continue
    }
    for (const line of unwrap(rest.join('\n')).split('\n').filter(Boolean)) {
      if (line.startsWith('- ')) notes.push(line.slice(2))
      else problems.push(`${c.name}: body: "## Notes" holds a line that is not a list item`)
    }
  }
  return { purpose: unwrap(purpose), notes }
}

function buildEcosystem(corpus, problems, { target, refId, refs }) {
  const { ofType } = corpus
  const numberOf = new Map(ofType.tasks.map((t) => [t.id, t.data.number]))
  const layers = [...ofType.layers].sort(byKey((l) => l.data.order))
  const layerOrder = new Map(layers.map((l, i) => [l.id, i]))
  const fullName = new Map(ofType.repos.map((r) => [r.id, r.data.full_name]))
  const datasets = ofType.datasets.find((d) => d.id === 'ecosystem')?.data ?? {}

  const nodes = ofType.components
    .map((c) => {
      const d = c.data
      const perState = (field) =>
        Object.fromEntries(
          STATES.map((s) => {
            const value = field === 'repo' ? refId(c, `repo_${s}`, 'repos') : (d[`path_${s}`] ?? null)
            if (value !== null && !d.states.includes(s)) problems.push(`${c.name}: ${field}_${s}: set, but ${s} is not in states`)
            return [s, value !== null && field === 'repo' ? fullName.get(value) : value]
          }),
        )
      return {
        id: c.id,
        name: d.name,
        kind: d.kind,
        language: d.language,
        layer: refId(c, 'layer', 'layers'),
        states: d.states,
        repo: perState('repo'),
        path: perState('path'),
        status: d.status,
        version: d.version ?? null,
        registry: d.registry ?? null,
        twin: refId(c, 'twin', 'components'),
        ...purposeAndNotes(c, problems),
        tasks: refs(c, 'tasks', 'tasks').map((t) => numberOf.get(t.id)),
        links: (d.links ?? []).map((l) => {
          const m = /^\[(.+)\]\((\S+)\)$/.exec(l)
          return { label: m[1], url: m[2] }
        }),
        source: c.source,
      }
    })
    .sort((a, b) => (layerOrder.get(a.layer) ?? layers.length) - (layerOrder.get(b.layer) ?? layers.length) || byKey((n) => n.id)(a, b))

  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const record = new Map(ofType.components.map((c) => [c.id, c]))
  const edges = []
  for (const node of nodes) {
    const c = record.get(node.id)
    const notes = (c.data.edge_notes ?? []).map((n) => ({
      edge: n.edge,
      to: target(c, 'edge_notes.to', n.to, 'components')?.id,
      note: n.note,
      used: false,
    }))
    const noteFor = (field, to) => {
      const found = notes.filter((n) => n.edge === field && n.to === to)
      if (found.length > 1) problems.push(`${c.name}: edge_notes: more than one note for ${field} ${to}`)
      for (const n of found) n.used = true
      return found[0]?.note
    }
    const add = (field, edge) => {
      const from = nodeById.get(edge.from)
      const to = nodeById.get(edge.to)
      if (!edge.states.every((s) => from.states.includes(s) && to.states.includes(s)))
        problems.push(`${c.name}: ${field}: the edge to ${edge.to} is in ${edge.states.join(' and ')}, which both components must be in`)
      if (edges.some((e) => e.from === edge.from && e.to === edge.to && e.kind === edge.kind))
        problems.push(`${c.name}: ${field}: ${edge.to} is listed twice for ${edge.kind}`)
      const note = noteFor(field, edge.to)
      edges.push(note === undefined ? edge : { ...edge, note })
    }

    if (node.twin !== null) {
      const twin = nodeById.get(node.twin)
      if (twin.twin !== node.id) problems.push(`${c.name}: twin: ${twin.id} must name ${node.id} as its twin`)
      if (node.language === twin.language) problems.push(`${c.name}: twin: twins must differ in language`)
      // One twin edge per pair, from the Rust member, or from the first id when neither is Rust.
      if (node.language === 'rust' || (twin.language !== 'rust' && node.id < twin.id)) {
        const states = STATES.filter((s) => node.states.includes(s) && twin.states.includes(s))
        if (states.length === 0) problems.push(`${c.name}: twin: ${node.id} and ${twin.id} share no state`)
        else add('twin', { from: node.id, to: twin.id, kind: 'twin', states })
      }
    }
    for (const kind of EDGE_KINDS)
      for (const [suffix, states] of SUFFIXES) {
        const field = kind.replace('-', '_') + suffix
        for (const to of refs(c, field, 'components')) add(field, { from: node.id, to: to.id, kind, states })
      }
    for (const n of notes) if (!n.used && n.to !== undefined) problems.push(`${c.name}: edge_notes: no ${n.edge} edge to ${n.to}`)
  }

  const pairs = new Set()
  for (const o of ofType.overlaps) {
    const from = refId(o, 'from', 'components')
    const to = refId(o, 'to', 'components')
    if (from === null || to === null) continue
    if (o.id !== `${from} overlaps ${to}`) problems.push(`${o.name}: (id): name it "${from} overlaps ${to}"`)
    if (nodeById.get(from).twin === to) problems.push(`${o.name}: (data): an overlap never joins twins`)
    const pair = [from, to].sort().join('|')
    if (pairs.has(pair)) problems.push(`${o.name}: (data): ${from} and ${to} already have an overlap`)
    pairs.add(pair)
    const states = o.data.states
    if (!states.every((s) => nodeById.get(from).states.includes(s) && nodeById.get(to).states.includes(s)))
      problems.push(`${o.name}: states: both components must be in ${states.join(' and ')}`)
    edges.push({ from, to, kind: 'overlaps', states, note: o.data.note, overlap: o.data.overlap })
  }

  return {
    asOf: datasets.as_of,
    sources: datasets.sources ?? [],
    layers: layers.map((l) => ({ id: l.id, label: l.data.label, summary: unwrap(l.body) })),
    repos: [...ofType.repos].sort(byKey((r) => r.data.full_name)).map((r) => ({ id: r.data.full_name, label: r.data.label, url: r.data.url })),
    nodes,
    edges,
  }
}

/**
 * The explorer's data built from a plan corpus, and every problem found. `root` is the folder the
 * `source` paths start from: the repo root.
 */
export function buildData(corpusDir, root) {
  const corpus = readCorpus(corpusDir, root)
  const problems = [...corpus.problems]
  if (problems.length > 0) return { problems }
  const links = linker(corpus, problems)
  const plan = buildPlan(corpus, problems, links)
  const ecosystem = buildEcosystem(corpus, problems, links)
  return { ecosystem, plan, problems: [...new Set(problems)] }
}

function main() {
  const explorer = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const repo = resolve(explorer, '../..')
  let values
  try {
    ;({ values } = parseArgs({ options: { corpus: { type: 'string' }, out: { type: 'string' } }, strict: true }))
  } catch (e) {
    console.error(`build-data: ${e.message}\nUsage: node scripts/build-data.mjs [--corpus <dir>] [--out <dir>]`)
    process.exit(2)
  }
  const out = resolve(values.out ?? join(explorer, 'data'))
  const data = buildData(resolve(values.corpus ?? join(repo, 'docs/planning')), repo)
  if (data.problems.length > 0) {
    for (const p of data.problems) console.error(p)
    console.error(`build-data: ${data.problems.length} problem(s); nothing written.`)
    process.exit(1)
  }
  try {
    mkdirSync(out, { recursive: true })
    for (const [name, value] of [['ecosystem.json', data.ecosystem], ['plan.json', data.plan]])
      writeFileSync(join(out, name), `${JSON.stringify(value, null, 2)}\n`)
  } catch (e) {
    console.error(`build-data: cannot write ${out}: ${e.code ?? e.message}`)
    process.exit(1)
  }
  console.log(`build-data: wrote ${data.ecosystem.nodes.length} components, ${data.ecosystem.edges.length} edges and ${data.plan.tasks.length} tasks to ${out}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
