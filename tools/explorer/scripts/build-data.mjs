// Builds data/ecosystem.json and data/plan.json from the plan corpus in docs/planning.
// Usage: node scripts/build-data.mjs [--corpus <dir>] [--out <dir>]
// It fails with one line per problem when a link points at no record of the right type, or when the
// records break a rule that the corpus-schema validator cannot check. See docs/planning/README.md.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const explorer = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo = resolve(explorer, '../..')
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const i = args.indexOf(name)
  return i < 0 ? fallback : resolve(args[i + 1])
}
const corpus = option('--corpus', join(repo, 'docs/planning'))
const out = option('--out', join(explorer, 'data'))

const STATES = ['present', 'target']
const EDGE_KINDS = ['depends', 'dev-depends', 'implements', 'extends', 'validates', 'reads']
// Field suffix -> the states an edge in that field exists in.
const SUFFIXES = [
  ['', ['present', 'target']],
  ['_new', ['target']],
  ['_going', ['present']],
]

const problems = []
const toPosix = (p) => p.split(sep).join('/')
const byKey = (key) => (a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)

// ---- reading

/** Frontmatter data and body of one Markdown file. */
function readNote(file) {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  if (!text.startsWith('---\n')) return { data: {}, body: text }
  const end = text.indexOf('\n---', 3)
  if (end < 0) throw new Error(`${file}: frontmatter has no closing ---`)
  const after = text.indexOf('\n', end + 1)
  return {
    data: parse(text.slice(4, end + 1)) ?? {},
    body: after < 0 ? '' : text.slice(after + 1),
  }
}

/** The record files of a type folder, at any depth. A record folder's own files are skipped. */
function recordFiles(dir, type) {
  const found = []
  const walk = (d, top) => {
    const names = readdirSync(d).filter((n) => !n.startsWith('.') && n !== 'node_modules')
    if (!top && names.includes(`${basename(d)}.md`)) {
      found.push(join(d, `${basename(d)}.md`))
      return
    }
    for (const name of names.sort()) {
      const path = join(d, name)
      if (statSync(path).isDirectory()) walk(path, false)
      else if (name.endsWith('.md') && !(top && name === `${type}.schema.md`)) found.push(path)
    }
  }
  walk(dir, true)
  return found
}

const TYPES = ['tasks', 'milestones', 'components', 'layers', 'repos', 'overlaps', 'datasets']
const records = new Map() // corpus-relative path -> record
const ofType = Object.fromEntries(TYPES.map((t) => [t, []]))
for (const type of TYPES) {
  const dir = join(corpus, type)
  if (!existsSync(dir)) {
    problems.push(`${toPosix(relative(repo, dir))}: (folder): missing`)
    continue
  }
  for (const file of recordFiles(dir, type)) {
    const { data, body } = readNote(file)
    const record = {
      type,
      id: basename(file, '.md'),
      path: toPosix(relative(corpus, file)),
      source: toPosix(relative(repo, file)),
      data,
      body,
    }
    records.set(record.path, record)
    ofType[type].push(record)
  }
  ofType[type].sort(byKey((r) => r.id))
}

/** The record a link field points at, or null after noting a problem. */
function target(record, field, value, type) {
  const m = typeof value === 'string' ? /^\[(?:\\.|[^\]\\])*\]\((<[^>]*>|[^)\s]*)\)$/.exec(value.trim()) : null
  if (m === null) {
    problems.push(`${record.source}: ${field}: ${JSON.stringify(value)} is not a Markdown link`)
    return null
  }
  const dest = m[1].startsWith('<') ? m[1].slice(1, -1) : m[1]
  let path
  try {
    path = posix.normalize(posix.join(posix.dirname(record.path), decodeURIComponent(dest)))
  } catch {
    problems.push(`${record.source}: ${field}: ${dest}: bad percent-encoding`)
    return null
  }
  const found = records.get(path)
  if (found === undefined || found.type !== type) {
    problems.push(`${record.source}: ${field}: ${dest} does not point at a ${type} record (dangling reference)`)
    return null
  }
  return found
}

const refId = (record, field, type) => {
  const value = record.data[field]
  return value === undefined ? null : (target(record, field, value, type)?.id ?? null)
}
const refIds = (record, field, type) =>
  (record.data[field] ?? []).map((v) => target(record, field, v, type)).filter(Boolean)

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

// ---- plan.json

const taskNumber = new Map() // task record id -> number
for (const t of ofType.tasks) {
  taskNumber.set(t.id, t.data.number)
  if (!t.id.startsWith(`${t.data.number} `))
    problems.push(`${t.source}: number: the file name must start with the number, ${t.data.number}`)
}
const numbers = ofType.tasks.map((t) => t.data.number)
for (const n of new Set(numbers.filter((n, i) => numbers.indexOf(n) !== i)))
  problems.push(`docs/planning/tasks: number: ${n} is used by more than one task`)
const toNumber = (r) => taskNumber.get(r.id)

const milestones = [...ofType.milestones].sort(byKey((m) => m.data.order))
const listedIn = new Map() // task number -> milestone ids that list it
for (const m of milestones)
  for (const t of refIds(m, 'tasks', 'tasks')) listedIn.set(toNumber(t), [...(listedIn.get(toNumber(t)) ?? []), m.id])

const tasks = [...ofType.tasks].sort(byKey((t) => t.data.number)).map((t) => {
  const milestone = refId(t, 'milestone', 'milestones')
  const after = refIds(t, 'after', 'tasks').map(toNumber).sort((a, b) => a - b)
  const lists = listedIn.get(t.data.number) ?? []
  if (milestone !== null && (lists.length !== 1 || lists[0] !== milestone))
    problems.push(
      `${t.source}: milestone: ${milestone} must list this task once under tasks; listed in ${lists.join(', ') || 'none'}`,
    )
  if (after.includes(t.data.number)) problems.push(`${t.source}: after: a task cannot wait on itself`)
  return {
    id: t.data.number,
    title: t.data.title,
    detail: t.data.detail,
    status: t.data.status,
    milestone,
    type: t.data.type,
    after,
    text: unwrap(t.body),
    source: t.source,
  }
})

// The after links have no cycle.
const afterOf = new Map(tasks.map((t) => [t.id, t.after]))
const state = new Map()
const visit = (n, path) => {
  if (state.get(n) === 'done') return
  if (state.get(n) === 'open') {
    problems.push(`docs/planning/tasks: after: cycle ${[...path, n].join(' -> ')}`)
    return
  }
  state.set(n, 'open')
  for (const a of afterOf.get(n) ?? []) visit(a, [...path, n])
  state.set(n, 'done')
}
for (const t of tasks) visit(t.id, [])

const statusOf = new Map(tasks.map((t) => [t.id, t.status]))
function milestoneStatus(ids) {
  const states = new Set(ids.map((n) => statusOf.get(n)))
  if (states.size > 0 && [...states].every((s) => s === 'done')) return 'done'
  return states.has('doing') || states.has('done') ? 'doing' : 'todo'
}

const taskSchema = readNote(join(corpus, 'tasks/tasks.schema.md')).data
const labels = (field) => taskSchema.properties[field].oneOf.map((v) => ({ id: v.const, label: v.title }))
const datasetOf = (id) => ofType.datasets.find((d) => d.id === id)?.data ?? {}

const plan = {
  asOf: datasetOf('plan').as_of,
  statuses: labels('status'),
  types: labels('type'),
  milestones: milestones.map((m) => {
    const ids = refIds(m, 'tasks', 'tasks').map(toNumber)
    return {
      id: m.id,
      title: m.data.title,
      goal: unwrap(m.body),
      status: milestoneStatus(ids),
      tasks: ids,
      source: m.source,
    }
  }),
  tasks,
}

// ---- ecosystem.json

const layers = [...ofType.layers].sort(byKey((l) => l.data.order))
const layerOrder = new Map(layers.map((l, i) => [l.id, i]))
const components = new Map(ofType.components.map((c) => [c.id, c]))

function body(c) {
  const [purpose, ...sections] = c.body.split(/^## /m)
  const notes = []
  for (const section of sections) {
    const [heading, ...rest] = section.split('\n')
    if (heading.trim() !== 'Notes') {
      problems.push(`${c.source}: body: unknown section "## ${heading.trim()}"; only "## Notes" is read`)
      continue
    }
    for (const line of unwrap(rest.join('\n')).split('\n').filter(Boolean)) {
      if (line.startsWith('- ')) notes.push(line.slice(2))
      else problems.push(`${c.source}: body: "## Notes" holds a line that is not a list item`)
    }
  }
  return { purpose: unwrap(purpose), notes }
}

const nodes = [...ofType.components]
  .map((c) => {
    const d = c.data
    const perState = (field) =>
      Object.fromEntries(
        STATES.map((s) => {
          const value = field === 'repo' ? refId(c, `repo_${s}`, 'repos') : (d[`path_${s}`] ?? null)
          if (value !== null && !d.states.includes(s))
            problems.push(`${c.source}: ${field}_${s}: set, but ${s} is not in states`)
          return [s, value === null ? null : field === 'repo' ? ofType.repos.find((r) => r.id === value).data.full_name : value]
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
      ...body(c),
      tasks: refIds(c, 'tasks', 'tasks').map(toNumber),
      links: (d.links ?? []).map((l) => {
        const m = /^\[(.+)\]\((\S+)\)$/.exec(l)
        return { label: m[1], url: m[2] }
      }),
      source: c.source,
    }
  })
  .sort((a, b) => {
    const la = layerOrder.get(a.layer) ?? layers.length
    const lb = layerOrder.get(b.layer) ?? layers.length
    return la - lb || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  })

const nodeById = new Map(nodes.map((n) => [n.id, n]))
const edges = []
for (const node of nodes) {
  const c = components.get(node.id)
  const notes = (c.data.edge_notes ?? []).map((n) => ({
    edge: n.edge,
    to: target(c, 'edge_notes.to', n.to, 'components')?.id,
    note: n.note,
    used: false,
  }))
  const noteFor = (field, to) => {
    const found = notes.filter((n) => n.edge === field && n.to === to)
    if (found.length > 1) problems.push(`${c.source}: edge_notes: more than one note for ${field} ${to}`)
    for (const n of found) n.used = true
    return found[0]?.note
  }
  const add = (field, edge) => {
    const from = nodeById.get(edge.from)
    const to = nodeById.get(edge.to)
    if (!edge.states.every((s) => from.states.includes(s) && to.states.includes(s)))
      problems.push(`${c.source}: ${field}: the edge to ${edge.to} is in ${edge.states.join(' and ')}, which both components must be in`)
    if (edges.some((e) => e.from === edge.from && e.to === edge.to && e.kind === edge.kind))
      problems.push(`${c.source}: ${field}: ${edge.to} is listed twice for ${edge.kind}`)
    const note = noteFor(field, edge.to)
    edges.push(note === undefined ? edge : { ...edge, note })
  }

  if (node.twin !== null) {
    const twin = nodeById.get(node.twin)
    if (twin.twin !== node.id) problems.push(`${c.source}: twin: ${twin.id} must name ${node.id} as its twin`)
    if (node.language === twin.language) problems.push(`${c.source}: twin: twins must differ in language`)
    // One twin edge per pair, from the Rust member, or from either member when neither is Rust.
    if (node.language === 'rust' || (twin.language !== 'rust' && node.id < twin.id)) {
      const states = STATES.filter((s) => node.states.includes(s) && twin.states.includes(s))
      add('twin', { from: node.id, to: twin.id, kind: 'twin', states })
    }
  }
  for (const kind of EDGE_KINDS)
    for (const [suffix, states] of SUFFIXES) {
      const field = kind.replace('-', '_') + suffix
      for (const to of refIds(c, field, 'components')) add(field, { from: node.id, to: to.id, kind, states })
    }
  for (const n of notes)
    if (!n.used && n.to !== undefined) problems.push(`${c.source}: edge_notes: no ${n.edge} edge to ${n.to}`)
}

const pairs = new Set()
for (const o of ofType.overlaps) {
  const from = refId(o, 'from', 'components')
  const to = refId(o, 'to', 'components')
  if (from === null || to === null) continue
  if (o.id !== `${from} overlaps ${to}`) problems.push(`${o.source}: (id): name it "${from} overlaps ${to}"`)
  if (nodeById.get(from).twin === to) problems.push(`${o.source}: (data): an overlap never joins twins`)
  const pair = [from, to].sort().join('|')
  if (pairs.has(pair)) problems.push(`${o.source}: (data): ${from} and ${to} already have an overlap`)
  pairs.add(pair)
  const states = o.data.states
  if (!states.every((s) => nodeById.get(from).states.includes(s) && nodeById.get(to).states.includes(s)))
    problems.push(`${o.source}: states: both components must be in ${states.join(' and ')}`)
  edges.push({ from, to, kind: 'overlaps', states, note: o.data.note, overlap: o.data.overlap })
}

const ecosystem = {
  asOf: datasetOf('ecosystem').as_of,
  sources: datasetOf('ecosystem').sources ?? [],
  layers: layers.map((l) => ({ id: l.id, label: l.data.label, summary: unwrap(l.body) })),
  repos: [...ofType.repos]
    .sort(byKey((r) => r.data.full_name))
    .map((r) => ({ id: r.data.full_name, label: r.data.label, url: r.data.url })),
  nodes,
  edges,
}

if (problems.length > 0) {
  const unique = [...new Set(problems)]
  for (const p of unique) console.error(p)
  console.error(`build-data: ${unique.length} problem(s); nothing written.`)
  process.exit(1)
}

mkdirSync(out, { recursive: true })
for (const [name, value] of [['ecosystem.json', ecosystem], ['plan.json', plan]])
  writeFileSync(join(out, name), `${JSON.stringify(value, null, 2)}\n`)
console.log(`build-data: wrote ${nodes.length} components, ${edges.length} edges and ${tasks.length} tasks to ${out}`)
