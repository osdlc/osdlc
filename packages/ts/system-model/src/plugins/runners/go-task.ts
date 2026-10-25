/**
 * go-task (Taskfile.yml) — https://taskfile.dev
 *
 * `kind: "parse"` with two paths, as in `just.ts`:
 *
 *   listing  `task --list-all --json --taskfile <file>`: go-task lists its own
 *            tasks. It uses a real YAML parser and resolves `includes:`
 *            itself, so none of the reader's limits below apply. Needs
 *            `allowExec` and the `task` binary.
 *   reader   the hand-written `tasks:` reader in this file. Narrower, but it
 *            works on a machine with no `task` installed. That is what
 *            `allowExec: false` callers get, and what a new checkout has.
 *
 * The reader is always available. The listing is tried per Taskfile. Any
 * failure (non-zero exit, unparseable JSON, a listing with no tasks at all)
 * falls back to the reader for that file, with a diagnostic saying why. A
 * listing whose tasks all belong to other discovered Taskfiles is a success,
 * not a failure. That is what a root holding only `version:` and `includes:`
 * looks like, and its tasks are reported by the files that declare them. The
 * diagnostics say which path ran, so a caller never gets less data than it
 * expects without being told.
 *
 * A task's declaration (`desc`, `summary`, `internal`) is plain data in the
 * `tasks:` mapping. That is why a reader is possible.
 *
 * The reader handles only the `tasks:` mapping level, so it keeps going past
 * YAML a full parser would reject (see `yaml-lite.ts`).
 *
 * The lexing comes from `yaml-lite.ts`, shared with `docker-compose.ts` and
 * `github-actions.ts`: BOM strip, line split, comment strip, anchor/merge
 * detection, block-scalar masking, and truncation at the first document
 * separator. This file keeps the structural reader (the two-pass walk over
 * `tasks:`) and the diagnostics, whose wording says what a go-task user
 * loses.
 *
 * What the reader handles:
 *   - the top-level `tasks:` key (block-style only) and the task names
 *     nested one level under it
 *   - each task's `desc`, `summary`, `internal` scalar fields, one level
 *     under the task itself (deeper nesting — `cmds:`, `vars:`, … — is not
 *     descended into)
 *   - each task's `deps:`, as a flow list (`[a, b]`) or a block list of names
 *     or `- task: name` items
 *   - `#` comments (outside quoted strings) and single/double-quoted keys
 *     and values
 *
 * It does not handle the following. When it finds one, it emits a `warning`
 * Diagnostic (source: the file) instead of silently reporting too little:
 *   - YAML anchors/aliases (`&`/`*`)
 *   - merge keys (`<<`)
 *   - multiple YAML documents — a `---` separator or a `...` end marker at
 *     column 0 that is not inside a block scalar; only the content before it
 *     is read
 *   - a flow-style `tasks:` mapping (`tasks: { ... }`) — nothing is read
 *   - `includes:` pulling in other Taskfiles — included tasks are never
 *     enumerated, only the file's own `tasks:`
 *
 * All five warnings are dropped on the listing path. go-task parses the YAML
 * and resolves its includes itself, so none of these limits apply.
 *
 * The lexer handles two cases before the reader runs. First, it strips a
 * leading UTF-8 BOM. JS `\s` matches U+FEFF, so the BOM sticks to the first
 * key: `tasks:` after a BOM never matches `tasks`, and the file reads as
 * empty with no warning. `version:` is optional in Task v3, so `tasks:` really
 * is the first line of some Taskfiles. Second, a block scalar's body is
 * blanked, so it is text and not read as structure. A `cmds:` entry holding a
 * shell heredoc with a `---` line is shell, not a document separator, and an
 * `&` or `<<:` in there is not YAML either.
 *
 * A block-scalar description (`desc: |`) is read as absent, not as the
 * literal `|`. The form is recognized but not decoded.
 */

import { firstLine, stderrOrError } from '@osdlc/command-seam'

import type { ProviderContext } from '../../contract.ts'
import type { Diagnostic, ProviderResult, RunnerBrand, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import {
  afterSeparator,
  dependenciesIn,
  dirOf,
  looksPersistent,
  taskId,
} from '../support/shared.ts'
import { leadingSpaces, matchKey, prepass, unquote, unquoteValue } from '../support/yaml-lite.ts'

const CHAIN = [
  { label: 'runner', hint: "go-task runs tasks declared in a Taskfile's `tasks:` map." },
  { label: 'directory', hint: 'The directory holding the Taskfile. `.` is the root manifest.' },
  { label: 'task', hint: 'The key under `tasks:` in that Taskfile.' },
]

/**
 * The config filenames go-task looks for, in its priority order
 * (https://taskfile.dev/usage/: "Task looks for files with the following
 * names, in order of priority: `Taskfile.yml`, `taskfile.yml`,
 * `Taskfile.yaml`, `taskfile.yaml`, `Taskfile.dist.yml`, `taskfile.dist.yml`,
 * `Taskfile.dist.yaml`, `taskfile.dist.yaml`").
 */
export const CONFIG_NAMES = [
  'Taskfile.yml',
  'taskfile.yml',
  'Taskfile.yaml',
  'taskfile.yaml',
  'Taskfile.dist.yml',
  'taskfile.dist.yml',
  'Taskfile.dist.yaml',
  'taskfile.dist.yaml',
]

/**
 * A plain checklist glyph drawn here, since this package does not copy
 * artwork from any icon set. It is not simple-icons' `task` entry (which
 * comes from `go-task/task`'s `docs/static/img/logo_mono.svg`). The color
 * `#29beb0` is the fill in go-task's own logo
 * (`https://taskfile.dev/img/logo.svg`). It also matches simple-icons' hex for
 * the mark, which has no per-icon license override.
 */
export const GO_TASK_BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M7 8.5h5M7 12h7M7 15.5h4"/><path d="m15 14.5 1.6 1.6L20 12.5"/></svg>',
  color: '#29beb0',
}

const MULTI_DOC =
  'multi-document YAML (`---`/`...`) is not supported — only the content before the first separator was read'
const ANCHOR_ALIAS =
  'YAML anchors and aliases (`&`/`*`) are not supported — tasks defined or completed via an anchor/alias may be missing or incomplete'
const MERGE_KEY = 'YAML merge keys (`<<`) are not supported — merged fields were not applied'
const FLOW_TASKS =
  'flow-style `tasks:` mapping (`tasks: { ... }`) is not supported — no tasks were read from this file'
const INCLUDES =
  "`includes:` pulling in other Taskfiles is not supported — included tasks are not enumerated, only this file's own `tasks:`"

interface TaskfileTaskEntry {
  desc?: string
  summary?: string
  internal: boolean
  deps: string[]
}

interface ReadResult {
  tasks: Map<string, TaskfileTaskEntry>
  warnings: string[]
}

/**
 * Read a Taskfile's `tasks:` mapping. See the file header for exactly what
 * this does and does not attempt.
 */
export function readTaskfile(text: string): ReadResult {
  const warnings = new Set<string>()
  // The whole lexical layer, in one walk. `prepass` reports what it found as
  // booleans; the wording of each warning is this runner's own.
  const { lines, anchor, merge, multiDoc } = prepass(text)
  if (multiDoc) warnings.add(MULTI_DOC)
  if (anchor) warnings.add(ANCHOR_ALIAS)
  if (merge) warnings.add(MERGE_KEY)

  const tasks = new Map<string, TaskfileTaskEntry>()

  // Pass 1: top-level (indent 0) keys — locate `tasks:`, note `includes:`.
  let tasksLineIdx = -1
  let flowStyleTasks = false
  let hasIncludes = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.trim() === '') continue
    if (leadingSpaces(line) !== 0) continue
    const m = matchKey(line, 0)
    if (m === null) continue
    if (m.key === 'includes') hasIncludes = true
    if (m.key === 'tasks' && tasksLineIdx === -1) {
      tasksLineIdx = i
      if (m.value.trim().startsWith('{')) flowStyleTasks = true
    }
  }

  if (hasIncludes) warnings.add(INCLUDES)
  if (tasksLineIdx === -1) return { tasks, warnings: [...warnings] }
  if (flowStyleTasks) {
    warnings.add(FLOW_TASKS)
    return { tasks, warnings: [...warnings] }
  }

  // Pass 2: everything indented under `tasks:`. The first indent level seen
  // is the task-name level; the first indent level seen under ONE task is
  // that task's field level. Anything deeper (cmds:, vars:, …) is skipped.
  let taskNameIndent = -1
  let currentTask: string | null = null
  let currentFieldIndent = -1
  let inDeps = false

  for (let i = tasksLineIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.trim() === '') continue
    const indent = leadingSpaces(line)
    if (indent <= 0) break // back to top level: `tasks:` mapping is over

    if (taskNameIndent === -1) taskNameIndent = indent

    if (indent === taskNameIndent) {
      const m = matchKey(line, indent)
      if (m === null) continue
      currentTask = m.key
      currentFieldIndent = -1
      if (!tasks.has(currentTask)) tasks.set(currentTask, { internal: false, deps: [] })
      inDeps = false
      continue
    }

    if (indent < taskNameIndent) break
    if (currentTask === null) continue
    const entry = tasks.get(currentTask)
    if (entry === undefined) continue

    if (currentFieldIndent === -1) currentFieldIndent = indent
    if (indent !== currentFieldIndent || (inDeps && line.trimStart().startsWith('-'))) {
      // Deeper than the task's own fields, or a `- item` at the same indent
      // as `deps:` (valid YAML): read only a `deps:` block list.
      const dep = inDeps ? blockDep(line) : undefined
      if (dep !== undefined) entry.deps.push(dep)
      continue
    }

    const m = matchKey(line, indent)
    inDeps = m?.key === 'deps' && m.value.trim() === ''
    if (m === null) continue
    if (m.key === 'desc') {
      const v = unquoteValue(m.value)
      if (v !== undefined) entry.desc = v
    } else if (m.key === 'summary') {
      const v = unquoteValue(m.value)
      if (v !== undefined) entry.summary = v
    } else if (m.key === 'internal') {
      entry.internal = m.value.trim() === 'true'
    } else if (m.key === 'deps') {
      entry.deps.push(...flowDeps(m.value))
    }
  }

  return { tasks, warnings: [...warnings] }
}

/**
 * The task a `deps:` block item names: `- name`, `- task: name` or
 * `- {task: name, vars: {...}}`. Anything else gives none.
 */
function blockDep(line: string): string | undefined {
  const m = /^\s*-(.*)$/.exec(line.replace(/\s#.*$/, ''))
  if (m === null) return undefined
  return depItem(m[1]!.trim())
}

/** The names in a flow `deps: [a, "b", {task: c, vars: {X: 1}}]`. Anything else gives none. */
function flowDeps(value: string): string[] {
  const t = value.replace(/\s#.*$/, '').trim()
  if (!t.startsWith('[') || !t.endsWith(']')) return []
  return splitTopLevel(t.slice(1, -1))
    .map(depItem)
    .filter((dep): dep is string => dep !== undefined)
}

/** One dependency item: a name, `task: name`, or a `{task: name, ...}` mapping. */
function depItem(raw: string): string | undefined {
  let item = raw.trim()
  if (item.startsWith('{') && item.endsWith('}')) {
    const task = splitTopLevel(item.slice(1, -1))
      .map((part) => /^task\s*:\s*(.*)$/.exec(part.trim()))
      .find((m) => m !== null)
    if (task === undefined) return undefined
    item = task[1]!.trim()
  } else {
    item = item.replace(/^task\s*:\s*/, '')
  }
  if (item === '' || /^[{[]/.test(item) || item.endsWith(':')) return undefined
  return unquote(item)
}

/** Split on commas outside brackets, braces and quotes. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quote !== null) {
      if (c === '\\' && quote === '"') i++
      else if (c === quote) quote = null
    } else if (c === '"' || c === "'") quote = c
    else if (c === '[' || c === '{') depth++
    else if (c === ']' || c === '}') depth--
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((part) => part.trim()).filter((part) => part !== '')
}

/**
 * One task as go-task's own `--json` listing emits it. Field names from
 * taskfile.dev's CLI reference, "JSON Output Format for Task Listing":
 *
 *     { "tasks": [ { "name": "build", "task": "build",
 *                    "desc": "Build the application",
 *                    "summary": "…", "up_to_date": false,
 *                    "location": { "line": 12, "column": 3,
 *                                  "taskfile": "/path/to/Taskfile.yml" } } ],
 *       "location": "/path/to/Taskfile.yml" }
 *
 * Every field is optional because this is untrusted output from a binary
 * whose version we do not control. An older or newer `task` that drops a
 * field must not cause a throw.
 */
interface ListedTask {
  name?: unknown
  task?: unknown
  desc?: unknown
  summary?: unknown
  location?: { taskfile?: unknown } | null
}

/**
 * A hard cap on the listing. `task --list-all` parses a Taskfile and its
 * includes without running any task's commands, so it is fast. But a
 * Taskfile whose includes reach a remote file (taskfile.dev "Remote
 * Taskfiles") can hang on the network, and a `parse` runner must not hang.
 */
const LIST_TIMEOUT_MS = 10_000

/**
 * `--list-all` ("List all tasks, including those without descriptions.") and
 * `--json` ("Output task information in JSON format (use with `--list` or
 * `--list-all`)") — both quoted from https://taskfile.dev/reference/cli/.
 *
 * `--taskfile`, not `--dir`. The docs give them as alternatives: "Users can
 * override the default search by specifying a path with the --taskfile flag
 * or changing the search directory with the --dir flag"
 * (https://taskfile.dev/docs/guide, "Running Taskfiles"). `--dir` names a
 * directory, and go-task then picks a file by its own priority. That is the
 * wrong file when a directory holds more than one of the CONFIG_NAMES.
 * `--taskfile` names the exact file discovery found, so the listing path
 * covers the same files as the reader path: one invocation per file.
 */
function listArgv(file: string): string[] {
  return ['--list-all', '--json', '--taskfile', file]
}

async function listTasks(
  ctx: ProviderContext,
  file: string,
): Promise<{ entries: ListedTask[]; error?: string }> {
  // `.run()` never rejects (see spawnRunnerAsync). A missing binary, a
  // timeout and an abort all come back as a non-zero exitCode. So only the
  // exit code and the JSON parse need checking.
  const res = await ctx.runner('task').run(listArgv(file), {
    cwd: ctx.root,
    signal: ctx.signal,
  })
  if (res.exitCode !== 0) {
    return {
      entries: [],
      error: firstLine(stderrOrError(res), `exit ${res.exitCode}`),
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(res.stdout)
  } catch (err) {
    return { entries: [], error: `unparseable --json listing: ${String(err)}` }
  }
  const entries = (parsed as { tasks?: unknown } | null)?.tasks
  if (!Array.isArray(entries))
    return { entries: [], error: 'no `tasks` array in the --json listing' }
  return { entries: entries as ListedTask[] }
}

/**
 * Which discovered Taskfile an entry was declared in, or `undefined` when it
 * belongs to none of them.
 *
 * go-task resolves `includes:` itself, so the root Taskfile's listing also
 * holds every included file's tasks. Discovery finds those included files
 * too, so a simple invocation per file would report the same task twice
 * (once as `docs:build` from the root, once as `build` from
 * `docs/Taskfile.yml`). Each entry's `location.taskfile` says where it came
 * from. So an entry is emitted only by the invocation for its own file, and
 * every task appears once, with the same name, id, source and argv the
 * reader path would give it.
 *
 * The match is by longest path suffix, not by string equality with
 * `resolve(root, f)`. go-task reports a real path, and a root reached through
 * a symlink (macOS's `/var` -> `/private/var`, a worktree behind a symlinked
 * checkout) would fail equality for every entry. The longest match wins, so
 * `/abs/root/docs/Taskfile.yml` goes to `docs/Taskfile.yml`, not to the
 * root's `Taskfile.yml`.
 */
function ownerOf(location: string, files: string[]): string | undefined {
  const norm = location.replace(/\\/g, '/')
  let best: string | undefined
  for (const f of files) {
    if (norm === f || norm.endsWith(`/${f}`)) {
      if (best === undefined || f.length > best.length) best = f
    }
  }
  return best
}

/** Entries of `file`'s own listing that `file` — not another discovered Taskfile — owns. */
function ownEntries(
  entries: ListedTask[],
  file: string,
  files: string[],
): { name: string; doc?: string }[] {
  const out: { name: string; doc?: string }[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    const name =
      typeof entry.name === 'string' && entry.name !== ''
        ? entry.name
        : typeof entry.task === 'string'
          ? entry.task
          : ''
    if (name === '' || seen.has(name)) continue

    const location = entry.location?.taskfile
    if (typeof location === 'string' && location !== '') {
      const owner = ownerOf(location, files)
      // Owned by another discovered Taskfile: that file's own invocation
      // emits it, under its plain name. Owned by no discovered file: an
      // include discovery never saw. This listing is the only place it
      // appears, so it is attributed to this file.
      if (owner !== undefined && owner !== file) continue
    } else if (name.includes(':')) {
      // No location. `:` is go-task's namespace separator for included
      // Taskfiles, and the reader cannot produce such a name. So a namespaced
      // name here comes from an include. It is dropped, so a task the
      // included file's own invocation emits is not reported twice.
      continue
    }

    seen.add(name)
    const desc = typeof entry.desc === 'string' && entry.desc !== '' ? entry.desc : undefined
    const summary =
      typeof entry.summary === 'string' && entry.summary !== '' ? entry.summary : undefined
    const doc = desc ?? summary
    out.push(doc === undefined ? { name } : { name, doc })
  }
  return out
}

/**
 * The discovered files go-task's directory search would reach.
 *
 * go-task reads one Taskfile per directory, picked by CONFIG_NAMES priority.
 * So `--dir <dir>`, and the root's no-flag form (the same search in the
 * catalog root), can only reach that directory's highest-priority file. Any
 * other file in the same directory must be named; see {@link makeTask}.
 */
function priorityWinners(files: string[]): Set<string> {
  const best = new Map<string, { rank: number; file: string }>()
  for (const file of files) {
    const dir = dirOf(file)
    const rank = CONFIG_NAMES.indexOf(dir === '.' ? file : file.slice(dir.length + 1))
    // Discovery only yields CONFIG_NAMES, so an unranked name cannot happen.
    // If one does, treat it as lowest priority, not as the winner.
    const ranked = rank === -1 ? CONFIG_NAMES.length : rank
    const held = best.get(dir)
    if (held === undefined || ranked < held.rank) best.set(dir, { rank: ranked, file })
  }
  return new Set([...best.values()].map((b) => b.file))
}

/**
 * A dependency resolves to a task of the same Taskfile. One with a `:`
 * names a task of an included file, and stays unresolved.
 */
function makeTask(
  file: string,
  name: string,
  doc: string | undefined,
  reachableByDir: boolean,
): Task {
  const dir = dirOf(file)
  // go-task's directory flag, `-d`/`--dir`: "Set the directory where Task
  // will run and look for Taskfiles" (taskfile.dev CLI reference). A root
  // Taskfile gets no flag. This is the command a person runs, and it is the
  // same on both paths. The listing call uses `--taskfile` for its own
  // reasons (see listArgv), and that does not affect argv here.
  //
  // The exception is a file `--dir` cannot reach. When a directory holds more
  // than one of the CONFIG_NAMES, only the highest-priority one is reachable
  // by directory (see priorityWinners). The others get `--taskfile <file>`,
  // the flag the docs give as the alternative to `--dir` ("Users can override
  // the default search by specifying a path with the --taskfile flag or
  // changing the search directory with the --dir flag",
  // https://taskfile.dev/docs/guide, "Running Taskfiles"). go-task runs from
  // that file's own directory, so `cwd` stays "." either way.
  const argv = reachableByDir
    ? dir === '.'
      ? ['task', name]
      : ['task', '--dir', dir, name]
    : ['task', '--taskfile', file, name]
  return {
    id: taskId('go-task', file, name),
    runner: 'go-task',
    path: ['go-task', dir, name],
    argv,
    cwd: '.',
    display: argv.join(' '),
    parameters: [],
    source: file,
    origin: 'declared',
    ...(doc ? { doc } : {}),
    tags: ['go-task', dir],
    persistent: { value: looksPersistent(name), declared: false },
    executes: 'local',
  }
}

export const goTaskRunner: RunnerRole = {
  // `parse`, not `exec`: the reader means this runner always has tasks to
  // offer. It runs `task` when allowed, and says when it did not.
  kind: 'parse',
  probe: { timeoutMs: LIST_TIMEOUT_MS, cost: 'cheap' },
  chain: CHAIN,

  async collect(ctx: ProviderContext): Promise<ProviderResult> {
    const found = await Promise.all(CONFIG_NAMES.map((name) => ctx.files(name)))
    const files = [...new Set(found.flat())].sort()
    if (files.length === 0) return { status: 'absent', tasks: [], diagnostics: [] }

    const diagnostics: Diagnostic[] = []
    const tasks: Task[] = []
    // `ctx.which`, not a `--version` call: a PATH lookup answers the same
    // question without starting a process.
    const usable = ctx.allowExec && ctx.which('task') !== null
    const winners = priorityWinners(files)
    // One info line per run, not per file: a monorepo with fifty Taskfiles
    // would otherwise get fifty identical lines. The detail that does vary
    // per file (a file the listing failed for) is still reported per file,
    // with its source.
    let listingRan = false

    if (!usable && ctx.allowExec) {
      diagnostics.push({
        severity: 'warning',
        message:
          "`task` is not on the PATH — Taskfiles were read by this package's own reader, so `includes:`, YAML anchors/aliases, merge keys, flow-style `tasks:` and multi-document files are not resolved",
      })
    }

    for (const file of files) {
      // Read even on the listing path: `internal` is checked against the
      // reader below. An unreadable file must not block the listing.
      const text = await ctx.readText(file)
      const { tasks: parsed, warnings } =
        text === null
          ? { tasks: new Map<string, TaskfileTaskEntry>(), warnings: [] as string[] }
          : readTaskfile(text)

      if (usable) {
        const listed = await listTasks(ctx, file)
        // Success means the listing has entries, not that it has tasks of its
        // own. A listing whose entries all belong to other discovered
        // Taskfiles is correct for a root that only includes others. Treating
        // it as a failure would fall back to the reader and emit the
        // `includes:` warning, which the listing just made false.
        if (listed.error === undefined && listed.entries.length > 0) {
          listingRan = true
          // go-task hides `internal: true` tasks from its listings ("Mark
          // tasks as internal to prevent them from appearing in CLI lists",
          // taskfile.dev/docs/guide), so this filter normally removes nothing.
          // It guards against a version that stops filtering. `internal` is
          // the one field the reader sees that the listing does not report, so
          // without this the two paths could disagree about which tasks exist.
          const own = ownEntries(listed.entries, file, files).filter(
            ({ name }) => parsed.get(name)?.internal !== true,
          )
          const names = new Set(own.map((e) => e.name))
          for (const { name, doc } of own) {
            // The listing has no dependencies, so they come from the reader.
            tasks.push({
              ...makeTask(file, name, doc, winners.has(file)),
              ...dependenciesIn('go-task', file, parsed.get(name)?.deps ?? [], names),
            })
          }
          continue
        }
        // A listing with no entries at all is a failure. Even a root that only
        // includes others lists its includes' tasks. Falling back costs one
        // file read and can only add tasks.
        const why = listed.error ?? 'the listing named no tasks at all'
        diagnostics.push({
          severity: 'warning',
          message: `\`task --list-all --json\` did not answer for this file (${why}) — fell back to this package's own reader`,
          source: file,
        })
      }

      for (const message of warnings) {
        diagnostics.push({ severity: 'warning', message, source: file })
      }
      const names = new Set([...parsed].filter(([, e]) => !e.internal).map(([name]) => name))
      for (const [name, entry] of parsed) {
        if (entry.internal) continue
        tasks.push({
          ...makeTask(file, name, entry.desc ?? entry.summary, winners.has(file)),
          ...dependenciesIn('go-task', file, entry.deps, names),
        })
      }
    }

    if (listingRan) {
      diagnostics.push({
        severity: 'info',
        message:
          "tasks were listed by `task --list-all --json`, which parses the YAML and resolves `includes:` itself — the reader's limitations do not apply to the files it answered for",
      })
    }

    return {
      status: tasks.length > 0 ? 'ok' : 'absent',
      tasks,
      diagnostics,
    }
  },

  // Arguments after `--` reach the task, not the tool.
  invoke: afterSeparator,
}
