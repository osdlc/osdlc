/**
 * go-task (Taskfile.yml) — https://taskfile.dev
 *
 * `kind: "parse"` with two paths, the same shape as `just.ts`:
 *
 *   listing  `task --list-all --json --taskfile <file>` — go-task's own
 *            enumeration. A real YAML parser plus go-task's own `includes:`
 *            resolution, so every limitation the reader declares below is
 *            lifted. Needs `allowExec` and the `task` binary.
 *   reader   the hand-written `tasks:` reader in this file. Narrower, but it
 *            works on a machine with no `task` installed — which is what
 *            `allowExec: false` callers get, and what a fresh checkout looks
 *            like.
 *
 * The reader is the floor and never regresses. The listing is an upgrade
 * taken per discovered file; any failure of it — non-zero exit, unparseable
 * JSON, a listing naming no tasks at all — falls back to the reader FOR THAT
 * FILE with a diagnostic saying why. A listing whose tasks all belong to
 * other discovered Taskfiles is a SUCCESS, not a failure: that is what an
 * aggregator root carrying only `version:` and `includes:` looks like, and
 * its tasks are reported by the files that declare them. Diagnostics name
 * which path ran, so a caller never silently gets thinner data than it
 * thought.
 *
 * A task's declaration (`desc`, `summary`, `internal`) is data sitting in the
 * `tasks:` mapping, which is why the reader can exist at all.
 *
 * There is no YAML dependency in this package (see `package.json`; the
 * monorepo's `yaml` and `yaml-splice` packages are span-preserving editors
 * for known top-level fields, not general parsers, and neither belongs in a
 * `parse` runner that reads arbitrary repositories). So the reader is
 * hand-written for exactly the `tasks:` mapping level.
 *
 * The lexing layer comes from `yaml-lite.ts`, shared with `docker-compose.ts`
 * and `github-actions.ts`: BOM strip, line split, comment strip, anchor/merge
 * flagging, block-scalar masking, and truncation at the first document
 * separator. What stays in this file is the structural reader — the two-pass
 * walk over `tasks:` — and the diagnostics, whose wording names what a
 * go-task user loses.
 *
 * THE READER'S CEILING. It reads:
 *   - the top-level `tasks:` key (block-style only) and the task names
 *     nested one level under it
 *   - each task's `desc`, `summary`, `internal` scalar fields, one level
 *     under the task itself (deeper nesting — `cmds:`, `vars:`, … — is not
 *     descended into)
 *   - `#` comments (outside quoted strings) and single/double-quoted keys
 *     and values
 *
 * It does NOT attempt, and emits a `warning` Diagnostic (source: the file)
 * when it detects one of these instead of silently under-reporting:
 *   - YAML anchors/aliases (`&`/`*`)
 *   - merge keys (`<<`)
 *   - multiple YAML documents — a `---` separator or a `...` end marker at
 *     column 0 that is not inside a block scalar; only the content before it
 *     is read
 *   - a flow-style `tasks:` mapping (`tasks: { ... }`) — nothing is read
 *   - `includes:` pulling in other Taskfiles — included tasks are never
 *     enumerated, only the file's own `tasks:`
 *
 * All five are SUPPRESSED on the listing path: go-task parses the YAML
 * itself and resolves its own includes, so each names a limitation that no
 * longer applies.
 *
 * TWO CASES THE LEXER SETTLES BEFORE THE READER RUNS. First, a leading UTF-8
 * BOM is stripped. JS `\s` matches U+FEFF, so the byte binds to the first
 * key: a BOM'd `tasks:` never matches `tasks`, and the file reads as empty
 * with nothing to report. `version:` is optional in Task v3, so `tasks:` is
 * genuinely the first line of real Taskfiles. Second, a block scalar's body
 * is blanked, so it is literal text and cannot be read as structure — a
 * `cmds:` entry holding a shell heredoc with a `---` line in it is shell,
 * not a document separator, and neither an `&` nor a `<<:` in there is YAML
 * either.
 *
 * A block-scalar description (`desc: |`) is read as absent rather than as
 * the literal `|`: the value is recognizable but not decoded.
 */

import { firstLine, stderrOrError } from '@osdlc/command-seam'

import type { ProviderContext } from '../../contract.ts'
import type { Diagnostic, ProviderResult, RunnerBrand, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import { afterSeparator, dirOf, looksPersistent, taskId } from '../support/shared.ts'
import { leadingSpaces, matchKey, prepass, unquoteValue } from '../support/yaml-lite.ts'

const CHAIN = [
  { label: 'runner', hint: "go-task runs tasks declared in a Taskfile's `tasks:` map." },
  { label: 'directory', hint: 'The directory holding the Taskfile. `.` is the root manifest.' },
  { label: 'task', hint: 'The key under `tasks:` in that Taskfile.' },
]

/**
 * Config filenames go-task actually looks for, in its own priority order —
 * https://taskfile.dev/usage/ ("Task looks for files with the following
 * names, in order of priority: `Taskfile.yml`, `taskfile.yml`,
 * `Taskfile.yaml`, `taskfile.yaml`, `Taskfile.dist.yml`, `taskfile.dist.yml`,
 * `Taskfile.dist.yaml`, `taskfile.dist.yaml`"). All eight are real; this
 * runner does not guess at a subset.
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
 * A checklist — an original substitute glyph, not simple-icons' `task` entry
 * (source: `go-task/task`'s own `docs/static/img/logo_mono.svg`), per the
 * house rule of not copying artwork from any icon set. Color `#29beb0` is
 * independently attested: it is the fill used in go-task's own logo, fetched
 * directly from `https://taskfile.dev/img/logo.svg`, and separately matches
 * simple-icons' recorded hex for the same mark, without a per-icon license
 * override.
 */
const BRAND: RunnerBrand = {
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
      if (!tasks.has(currentTask)) tasks.set(currentTask, { internal: false })
      continue
    }

    if (indent < taskNameIndent) break
    if (currentTask === null) continue

    if (currentFieldIndent === -1) currentFieldIndent = indent
    if (indent !== currentFieldIndent) continue // deeper than the task's own fields

    const m = matchKey(line, indent)
    if (m === null) continue
    const entry = tasks.get(currentTask)
    if (entry === undefined) continue
    if (m.key === 'desc') {
      const v = unquoteValue(m.value)
      if (v !== undefined) entry.desc = v
    } else if (m.key === 'summary') {
      const v = unquoteValue(m.value)
      if (v !== undefined) entry.summary = v
    } else if (m.key === 'internal') {
      entry.internal = m.value.trim() === 'true'
    }
  }

  return { tasks, warnings: [...warnings] }
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
 * Everything is optional here because this is untrusted output from a
 * binary whose version we do not control: an older or newer `task` that
 * drops a field must degrade, not throw.
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
 * includes and does not run any task's commands, so it is fast; a Taskfile
 * whose includes reach a remote entrypoint (taskfile.dev "Remote Taskfiles")
 * can still hang on the network, and a `parse`-kind runner must not.
 */
const LIST_TIMEOUT_MS = 10_000

/**
 * `--list-all` ("List all tasks, including those without descriptions.") and
 * `--json` ("Output task information in JSON format (use with `--list` or
 * `--list-all`)") — both quoted from https://taskfile.dev/reference/cli/.
 *
 * `--taskfile`, not `--dir`: the docs describe them as alternatives —
 * "Users can override the default search by specifying a path with the
 * --taskfile flag or changing the search directory with the --dir flag"
 * (https://taskfile.dev/docs/guide, "Running Taskfiles"). `--dir` names a
 * directory and go-task then picks by its own filename priority, which is
 * the wrong file whenever a directory holds two of the eight CONFIG_NAMES.
 * `--taskfile` pins exactly the file discovery found, so the listing path
 * enumerates the same files the reader path does — one invocation per
 * discovered file, no more and no fewer.
 */
function listArgv(file: string): string[] {
  return ['--list-all', '--json', '--taskfile', file]
}

async function listTasks(
  ctx: ProviderContext,
  file: string,
): Promise<{ entries: ListedTask[]; error?: string }> {
  // `.run()` never rejects (see spawnRunnerAsync): a missing binary, a
  // timeout kill and an abort all arrive as a non-zero exitCode. So the
  // only failure handling needed is the exit code and the JSON parse.
  const res = await ctx.runner('task').run(listArgv(file), {
    cwd: ctx.root,
    timeoutMs: LIST_TIMEOUT_MS,
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
 * Which discovered Taskfile an entry was DECLARED in, or `undefined` when it
 * belongs to none of them.
 *
 * go-task resolves `includes:` itself, so the root Taskfile's listing also
 * carries every included file's tasks — and discovery finds those included
 * files too, so a naive invocation per discovered file would report the same
 * task twice (once as `docs:build` from the root, once as `build` from
 * `docs/Taskfile.yml`). Each entry's `location.taskfile` says where it really
 * came from, so an entry is emitted only by the invocation for its own file
 * and every task appears exactly once, under the same name, id, source and
 * argv the reader path would have given it.
 *
 * The comparison is by longest matching path suffix rather than by string
 * equality with `resolve(root, f)`: go-task reports a real path, and a root
 * reached through a symlink (macOS's `/var` -> `/private/var`, a worktree
 * behind a symlinked checkout) would fail equality for every entry at once.
 * The longest match wins so that `/abs/root/docs/Taskfile.yml` is attributed
 * to `docs/Taskfile.yml` and not to the root's `Taskfile.yml`.
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
      // emits it, under its own plain name. Owned by no discovered file: an
      // include discovery never saw, so this listing is the only place it
      // exists and this file is the right place to attribute it to.
      if (owner !== undefined && owner !== file) continue
    } else if (name.includes(':')) {
      // No location to go on. `:` is go-task's namespace separator for
      // included Taskfiles, and the reader cannot produce such a name, so a
      // namespaced name here is an include — dropped rather than risk
      // double-reporting a task the included file's own invocation emits.
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
 * The discovered files go-task's own directory search would actually reach.
 *
 * go-task reads exactly ONE Taskfile per directory, picked by CONFIG_NAMES
 * priority. So `--dir <dir>` — and the root's no-flag form, which is the same
 * search run in the catalog root — can only ever address that directory's
 * highest-priority file. Any other discovered file in the same directory has
 * to be addressed by name; see {@link makeTask}.
 */
function priorityWinners(files: string[]): Set<string> {
  const best = new Map<string, { rank: number; file: string }>()
  for (const file of files) {
    const dir = dirOf(file)
    const rank = CONFIG_NAMES.indexOf(dir === '.' ? file : file.slice(dir.length + 1))
    // Discovery only yields CONFIG_NAMES, so an unranked name cannot happen;
    // treat one as lowest priority rather than as the winner.
    const ranked = rank === -1 ? CONFIG_NAMES.length : rank
    const held = best.get(dir)
    if (held === undefined || ranked < held.rank) best.set(dir, { rank: ranked, file })
  }
  return new Set([...best.values()].map((b) => b.file))
}

function makeTask(
  file: string,
  name: string,
  doc: string | undefined,
  reachableByDir: boolean,
): Task {
  const dir = dirOf(file)
  // go-task's own directory flag, `-d`/`--dir`: "Set the directory where
  // Task will run and look for Taskfiles" (taskfile.dev CLI reference). A
  // root Taskfile emits no flag at all. This is the command a human RUNS,
  // and stays identical on both paths — the listing path's own invocation
  // uses `--taskfile` for its own reasons (see listArgv) and never leaks
  // into argv here.
  //
  // EXCEPT for a file `--dir` cannot reach: a directory holding two of the
  // eight CONFIG_NAMES has seven losers whose tasks a directory-addressed
  // command would never resolve (see priorityWinners). Those get
  // `--taskfile <file>`, the flag the docs give as `--dir`'s alternative —
  // "Users can override the default search by specifying a path with the
  // --taskfile flag or changing the search directory with the --dir flag"
  // (https://taskfile.dev/docs/guide, "Running Taskfiles"). go-task runs from
  // the pinned file's own directory, so `cwd` stays "." either way.
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
  // `parse`, not `exec`: the reader means this runner always has something
  // to offer. It uses the binary when allowed, and says when it did not.
  kind: 'parse',
  chain: CHAIN,
  brand: BRAND,

  async collect(ctx: ProviderContext): Promise<ProviderResult> {
    const found = await Promise.all(CONFIG_NAMES.map((name) => ctx.files(name)))
    const files = [...new Set(found.flat())].sort()
    if (files.length === 0) return { status: 'absent', tasks: [], diagnostics: [] }

    const diagnostics: Diagnostic[] = []
    const tasks: Task[] = []
    // `ctx.which`, not a `--version` probe: a PATH lookup answers the same
    // question with no subprocess, which is cheaper and correct under a
    // `parse` runner's posture.
    const usable = ctx.allowExec && ctx.which('task') !== null
    const winners = priorityWinners(files)
    // One line per run, not per file: a monorepo with fifty Taskfiles would
    // otherwise get fifty identical infos. The per-file detail that DOES vary
    // — a file the listing could not answer for — is still reported per file,
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
      // reader below, and an unreadable file must not cost the listing.
      const text = await ctx.readText(file)
      const { tasks: parsed, warnings } =
        text === null
          ? { tasks: new Map<string, TaskfileTaskEntry>(), warnings: [] as string[] }
          : readTaskfile(text)

      if (usable) {
        const listed = await listTasks(ctx, file)
        // Answered, not "answered with tasks of its own": a listing whose
        // entries all belong to OTHER discovered Taskfiles is the correct
        // result for an aggregator root. Treating that as a failure would fall
        // back to the reader and re-emit the `includes:` warning the listing
        // had just made false.
        if (listed.error === undefined && listed.entries.length > 0) {
          listingRan = true
          for (const { name, doc } of ownEntries(listed.entries, file, files)) {
            // go-task hides `internal: true` tasks from its own listings
            // ("Mark tasks as internal to prevent them from appearing in CLI
            // lists", taskfile.dev/docs/guide), so this normally removes
            // nothing. It is belt and braces against a version that stops
            // filtering: `internal` is the one field the reader can see that
            // the listing does not report, so the two paths would otherwise
            // disagree about which tasks exist.
            if (parsed.get(name)?.internal === true) continue
            tasks.push(makeTask(file, name, doc, winners.has(file)))
          }
          continue
        }
        // A listing with no entries at all is a failure, not an answer: even
        // an aggregator's listing carries its includes' tasks. Falling back
        // costs one file read and can only add tasks.
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
      for (const [name, entry] of parsed) {
        if (entry.internal) continue
        tasks.push(makeTask(file, name, entry.desc ?? entry.summary, winners.has(file)))
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
