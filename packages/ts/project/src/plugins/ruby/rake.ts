/**
 * rake — tasks from a Rakefile, listed by rake itself when that is allowed and
 * scanned out of the source when it is not.
 *
 * Two paths, the same shape as `just.ts`:
 *
 *   exec    `rake -AT` asks rake to enumerate its own tasks. rake EVALUATES the
 *           Rakefile to do it, so this runs only when the caller passed
 *           `allowExec` — which, with the calling CLI's repository-trust gate,
 *           is the user's explicit consent to run this repository's own tools.
 *   parse   a regex over the source. A Rakefile is Ruby, not data, so a scanner
 *           sees `task :name do … end` and `namespace :ns do … end` literally
 *           written down and nothing else. Tasks built by a loop
 *           (`%w[a b c].each { |n| task n }`), by metaprogramming, by
 *           `Rake::TestTask.new` and friends, by `import`ing or `load`ing
 *           another file, or by `Dir.glob`bing a directory of task files are
 *           invisible to it — which is what `DYNAMIC_CONSTRUCTS` watches for, so
 *           the runner says so instead of silently under-reporting.
 *
 * The parse path is the floor: it is why this can be a `parse` runner at all,
 * and it is what runs on a box with no ruby, or for a caller that never opted
 * into execution. Which path ran is always in the diagnostics — and the
 * parsing-ceiling warning is NOT emitted on the exec path, because rake
 * enumerated the dynamic tasks there and the warning would be a lie.
 */

import { firstLine, stderrOrError } from '@osdlc/command-seam'

import type { ProviderContext } from '../../contract.ts'
import type { Diagnostic, Param, ProviderResult, RunnerBrand, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import { dirOf, taskId } from '../support/shared.ts'

const CHAIN = [
  { label: 'runner', hint: 'rake runs tasks declared in a Rakefile.' },
  { label: 'rakefile', hint: 'Which Rakefile declares the task. `.` is the one at the root.' },
  {
    label: 'task',
    hint: 'The task name, namespaced with `:` when declared inside a `namespace` block.',
  },
]

/**
 * The exact set rake itself searches for, copied from
 * `Rake::Application::DEFAULT_RAKEFILES` (rake 13.3.1,
 * lib/rake/application.rb) rather than guessed — rake tries them in this
 * order and stops at the first match.
 */
/** Rakefile names, in the order rake resolves its entry point. */
export const RAKEFILE_NAMES = ['rakefile', 'Rakefile', 'rakefile.rb', 'Rakefile.rb']

/** Task files a Rakefile loads. */
export const RAKE_TASK_FILES = '*.rake'

/**
 * The listing invocation. Every flag verified against `rake --help` on rake
 * 13.3.1:
 *
 *   -A, --all        "Show all tasks, even uncommented ones (in combination
 *                     with -T or -D)"
 *   -T, --tasks      "Display the tasks (matching optional PATTERN) with
 *                     descriptions, then exit. -AT combination displays all
 *                     the tasks, including those without descriptions."
 *   -N, --no-search  "Do not search parent directories for the Rakefile."
 *   -G, --no-system  "Use standard project Rakefile search paths, ignore
 *                     system wide rakefiles."
 *
 * `-AT` is rake's own documented spelling of the pair. `-N` and `-G` are the
 * containment: without them rake climbs out of the directory it was pointed
 * at, or reaches into `~/.rake`, and would then evaluate and report a Rakefile
 * that is not in the tree this package was asked to describe.
 *
 * The invocation runs with `cwd: ctx.root` rather than `-C <dir>` because the
 * only rakefile it is ever pointed at is the root one; see `collect`.
 *
 * Deliberately no `RAKE_COLUMNS` in the environment: rake truncates task
 * descriptions only when writing to a TTY or when that variable is set
 * (`Rake::Application#truncate_output?`, application.rb). Captured through a
 * pipe with the variable unset, descriptions come back whole.
 */
const EXEC_ARGV = ['-AT', '-N', '-G']

/**
 * Evaluating a Rakefile can load a whole Rails environment, so the cap is
 * generous — but it is a cap: a Rakefile that hangs must not hang the caller,
 * and a timeout degrades to the parse path like any other failure.
 */
const EXEC_TIMEOUT_MS = 30_000

/**
 * One line of `rake -AT`, matched against rake's own format string
 * (`printf("#{name} %-#{width}s  # %s\n", t.name_with_args, comment)` in
 * `Rake::Application#display_tasks_and_comments`, application.rb). `name` there
 * is the literal `"rake"` the application initializes itself with.
 *
 * Strict on purpose. A loose expression turns a Rakefile's own `puts` output,
 * or a Ruby warning printed on stdout during evaluation, into tasks. This
 * requires the whole shape: the `rake ` prefix, a task name of the characters
 * rake task names actually use, an optional `[arg,arg]` argument list
 * (`Rake::Task#name_with_args`, task.rb), the two-space gutter, and the `#`.
 */
const LISTING_LINE = /^rake ([A-Za-z0-9_][A-Za-z0-9_.:/-]*)(?:\[([^\]\n]*)\])? {2,}# ?(.*)$/

/**
 * Constructs that generate tasks a regex cannot see. Each one is reason
 * enough to emit the parsing-ceiling diagnostic — on the parse path only.
 */
const DYNAMIC_CONSTRUCTS: Array<{ pattern: RegExp; label: string }> = [
  {
    pattern: /\bRake::\w+Task\.new\b/,
    label: 'a Rake::*Task.new (e.g. Rake::TestTask) declaration',
  },
  { pattern: /^\s*import\s/m, label: 'an `import` of another rake file' },
  { pattern: /^\s*load\s+["']/m, label: 'a `load` of another file' },
  {
    pattern: /\bDir\.\[?glob\b|\bDir\[/,
    label: 'a `Dir.glob` (or `Dir[...]`) building tasks dynamically',
  },
  {
    pattern: /\.each\s*(do|\{)\s*\|[^|]*\|[^\n]*\btask\b/,
    label: 'a loop (`.each`) defining tasks dynamically',
  },
]

/**
 * A hand-drawn substitute glyph: simple-icons ships no mark for rake (Ruby's
 * task runner is not one of its slugs, and the `rake.com`/`Rake` finance apps
 * that do appear there are unrelated), so an MIT package never has to carry
 * someone else's CC-BY-SA/proprietary artwork. Ruby's own community color
 * (used on ruby-lang.org and by rbenv) is this red; rake itself publishes no
 * brand color of its own.
 */
const BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="11" y="9" width="2" height="13" rx="1"/><path d="M5 3h2l1.2 5H7L5.8 4H5V3Zm12 0h-2l-1.2 5H15l1.2-4H17V3ZM11 3h2l.6 5h-3.2L11 3Z"/><rect x="4" y="8" width="16" height="2.4" rx="1.2"/></svg>',
  color: '#cc342d',
}

export const rakeRunner: RunnerRole = {
  // `parse`, not `exec`: the scan means this runner always has something to
  // offer. It uses the binary when allowed, and says when it did not.
  kind: 'parse',
  chain: CHAIN,
  brand: BRAND,

  async collect(ctx: ProviderContext): Promise<ProviderResult> {
    const named = new Set<string>()
    const rakefiles: string[] = []
    /** The rakefile a bare `rake` at the catalog root would load, if any. */
    let rootRakefile: string | undefined
    for (const name of RAKEFILE_NAMES) {
      for (const file of await ctx.files(name)) {
        if (named.has(file)) continue
        named.add(file)
        rakefiles.push(file)
        // First match wins, in RAKEFILE_NAMES order — the same order rake
        // itself resolves the entry point in.
        if (rootRakefile === undefined && dirOf(file) === '.') rootRakefile = file
      }
    }

    // `*.rake` matches by basename across the whole tree, not only Rails'
    // `lib/tasks/`, so every `.rake` file is scanned the way a Rakefile is.
    const dotRake = new Set<string>()
    for (const file of await ctx.files(RAKE_TASK_FILES)) {
      dotRake.add(file)
      if (!named.has(file)) {
        named.add(file)
        rakefiles.push(file)
      }
    }
    rakefiles.sort()

    if (rakefiles.length === 0) return { status: 'absent', tasks: [], diagnostics: [] }

    const tasks: Task[] = []
    const diagnostics: Diagnostic[] = []

    // `ctx.which`, not a `--version` probe: a PATH lookup answers the same
    // question with no subprocess, which is cheaper and correct under a
    // `parse` runner's posture.
    const usable = ctx.allowExec && ctx.which('rake') !== null

    // ONE invocation, not one per file. rake loads the root Rakefile and
    // everything that Rakefile pulls in (`import`, `load`, a `Dir.glob` over
    // `lib/tasks/*.rake`) into a single task namespace, then prints the lot;
    // there is no per-file invocation that would not lie about which file a
    // task came from. So the exec path is scoped to the ROOT rakefile: its
    // tasks carry `source: rootRakefile`, the entry point rake was actually
    // given, and everything below stays on the parse path.
    //
    // No root rakefile means no exec path at all — running `rake` in a
    // directory that has none would either fail or, with parent search on,
    // evaluate a Rakefile outside the tree being described. `-N` forbids the
    // second; this check makes the first moot.
    let listed: ListedTask[] | undefined
    if (usable && rootRakefile !== undefined) {
      const outcome = await listViaRake(ctx)
      if (outcome.error !== undefined) {
        diagnostics.push({
          severity: 'warning',
          message:
            `\`rake ${EXEC_ARGV.join(' ')}\` failed (${outcome.error}) — tasks were parsed ` +
            'from source instead, so any task rake builds dynamically is missing from this list',
          source: rootRakefile,
        })
      } else {
        listed = outcome.tasks
      }
    } else if (ctx.allowExec && ctx.which('rake') === null) {
      diagnostics.push({
        severity: 'warning',
        message:
          '`rake` is not on the PATH — tasks were parsed from source, so any task built ' +
          'dynamically (a loop, a Rake::*Task, a loaded .rake file) is missing from this list',
      })
    } else if (usable) {
      diagnostics.push({
        severity: 'info',
        message:
          'no Rakefile at the catalog root, so rake was not asked to list its own tasks — ' +
          'tasks below were parsed from source',
      })
    }

    if (listed !== undefined && rootRakefile !== undefined) {
      for (const item of listed) {
        tasks.push(fromListing(item, rootRakefile))
      }
      diagnostics.push({
        severity: 'info',
        message:
          `tasks were enumerated by \`rake ${EXEC_ARGV.join(' ')}\`, which evaluated the ` +
          'Rakefile — so tasks built dynamically (loops, Rake::*Task declarations, loaded ' +
          '`.rake` files) are included, and their declaring file is not distinguished from ' +
          'the root Rakefile',
        source: rootRakefile,
      })
    }

    const listedNames = new Set(listed?.map((t) => t.name) ?? [])

    for (const file of rakefiles) {
      // The listing supersedes the root rakefile outright.
      if (listed !== undefined && file === rootRakefile) continue

      const text = await ctx.readText(file)
      if (text === null) continue
      const scanned = scanTasks(text)
      const dir = dirOf(file)

      // Did the root invocation already enumerate this file's tasks?
      //
      // `rake -AT` prints one flat namespace and never says which file a task
      // came from, so this is evidence, not knowledge — and it has to be
      // FILE-scoped. Dropping any parsed name that appears anywhere in the
      // listing deletes real tasks: an unrelated `tools/plugin/tasks.rake`
      // declaring its own `test` would lose it to the root Rakefile's `test`,
      // even though the two have different argv, ids and sources. Turning
      // execution on must never thin the list.
      //
      // The evidence used instead: EVERY task this file declares appears in
      // the listing. A `.rake` file the root Rakefile loaded satisfies that by
      // construction; one it never loaded fails it as soon as it declares a
      // single name of its own. `scanned.length > 0` keeps it from being
      // vacuously true — a file with no statically visible task offers no
      // evidence either way, so it is treated as unloaded and keeps both its
      // tasks and its warnings.
      //
      // The residual case is a `.rake` file that nothing loads and whose every
      // declared name happens to collide with a root task. It is dropped, and
      // that is a deliberate trade: the alternative rule (never dedupe) shows
      // the very common Rails `lib/tasks/*.rake` twice, once with the broken
      // `-C lib/tasks` addressing.
      if (
        listed !== undefined &&
        dotRake.has(file) &&
        scanned.length > 0 &&
        scanned.every((t) => listedNames.has(t.path))
      ) {
        // The whole file is superseded — its tasks AND its parsing-ceiling
        // warnings, which describe nothing that happened when rake itself
        // enumerated these tasks.
        continue
      }

      for (const name of scanned) {
        const argv = dir === '.' ? ['rake', name.path] : ['rake', '-C', dir, name.path]
        tasks.push({
          id: taskId('rake', file, name.path),
          runner: 'rake',
          path: ['rake', dir, name.path],
          argv,
          cwd: '.',
          display: argv.join(' '),
          parameters: [],
          source: file,
          origin: 'declared',
          ...(name.doc ? { doc: name.doc } : {}),
          tags: ['rake', 'ruby', dir],
          persistent: { value: false, declared: false },
          executes: 'local',
        })
      }

      for (const construct of DYNAMIC_CONSTRUCTS) {
        if (construct.pattern.test(text)) {
          diagnostics.push({
            severity: 'warning',
            message:
              `${file} contains ${construct.label} — rake tasks built this way are ` +
              'invisible to a parser and will not appear in this list. `rake -T` would ' +
              'see them, but it evaluates the Rakefile, which needs execution to be ' +
              'allowed.',
            source: file,
          })
        }
      }
    }

    if (tasks.length === 0 && diagnostics.length === 0) {
      return { status: 'absent', tasks: [], diagnostics: [] }
    }

    return {
      status: tasks.length > 0 ? 'ok' : 'absent',
      tasks,
      diagnostics,
    }
  },

  /** rake takes task arguments in brackets: `rake 'release[1.2,beta]'`. */
  invoke(task, args) {
    if (args.length === 0) return [...task.argv]
    const argv = [...task.argv]
    argv[argv.length - 1] = `${argv[argv.length - 1]}[${args.join(',')}]`
    return argv
  },
}

/** One row of `rake -AT`. */
interface ListedTask {
  /** Namespaced with `:`, exactly as rake printed it. */
  name: string
  /** `[lib,bump]` argument names, in declaration order. */
  args: string[]
  doc?: string | undefined
}

/**
 * Ask rake for its own task list.
 *
 * Never throws and never rejects: `AsyncCommandRunner.run` flattens a missing
 * binary, a timeout kill and an abort into a non-zero `exitCode`
 * (`spawnRunnerAsync`, `async.ts` in @osdlc/command-seam), so every failure
 * mode arrives here as data and leaves as an `error` string the caller turns
 * into a diagnostic before falling back to the parse path.
 */
async function listViaRake(ctx: ProviderContext): Promise<{ tasks: ListedTask[]; error?: string }> {
  const res = await ctx.runner('rake').run(EXEC_ARGV, {
    cwd: ctx.root,
    timeoutMs: EXEC_TIMEOUT_MS,
    signal: ctx.signal,
  })
  if (res.exitCode !== 0) {
    return { tasks: [], error: firstLine(stderrOrError(res), 'unknown failure') }
  }
  const tasks = parseListing(res.stdout)
  if (tasks.length === 0) {
    // A rake that exits 0 having printed nothing this parser recognizes is
    // not a repository with no tasks — a Rakefile that defines none would not
    // have been discovered. Treat it as a failed listing so the floor runs.
    return { tasks: [], error: 'no task lines in the output' }
  }
  return { tasks }
}

export function parseListing(stdout: string): ListedTask[] {
  const out: ListedTask[] = []
  const seen = new Set<string>()
  for (const raw of stdout.split(/\r?\n/)) {
    const m = LISTING_LINE.exec(raw.trimEnd())
    const name = m?.[1]
    if (name === undefined || seen.has(name)) continue
    seen.add(name)
    const args = (m?.[2] ?? '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
    const doc = (m?.[3] ?? '').trim()
    out.push({ name, args, ...(doc ? { doc } : {}) })
  }
  return out
}

/**
 * `source` is the root rakefile: the entry point rake was handed. It is the
 * honest answer for a single invocation that folded every loaded file into one
 * namespace — a per-file attribution here would be invented. `id`, `path`,
 * `argv`, `display` and `cwd` keep the parse path's shapes, so a task does not
 * change identity when a caller turns execution on.
 */
function fromListing(item: ListedTask, rootRakefile: string): Task {
  const argv = ['rake', item.name]
  const parameters = item.args.map(toParam)
  return {
    id: taskId('rake', rootRakefile, item.name),
    runner: 'rake',
    path: ['rake', '.', item.name],
    argv,
    cwd: '.',
    // Placeholders live ONLY here. `argv` above is executable as-is.
    display: `${argv.join(' ')}${parameters.length > 0 ? `[${item.args.join(',')}]` : ''}`,
    parameters,
    source: rootRakefile,
    origin: 'declared',
    ...(item.doc ? { doc: item.doc } : {}),
    tags: ['rake', 'ruby', '.'],
    persistent: { value: false, declared: false },
    executes: 'local',
  }
}

/**
 * rake arguments are positional and always optional — an unsupplied one
 * arrives as `nil` rather than an error — and rake has no variadic form, so
 * both flags are fixed.
 */
function toParam(name: string): Param {
  return { name, required: false, variadic: false }
}

interface ScannedTask {
  /** Namespaced with `:` — `db:migrate`, `db:seed:demo`. */
  path: string
  doc?: string | undefined
}

/**
 * `task :name`, `task "name"`, `task 'name'`, optionally followed by a `=>`
 * or `name:` dependency clause. Captures only the name; dependencies are not
 * modeled as `Task.parameters` because rake dependencies are not runtime
 * inputs the way a just parameter is.
 */
const TASK_DECL = /^\s*task\s*\(?\s*(?::([A-Za-z0-9_]+)|"([^"]+)"|'([^']+)')/

/** `namespace :name do` / `namespace "name" do` — a namespace always opens a `do` block. */
const NAMESPACE_OPEN = /^\s*namespace\s*\(?\s*(?::([A-Za-z0-9_]+)|"([^"]+)"|'([^']+)')\)?\s*do\b/

/** `desc "..."` / `desc '...'`, the line immediately before a `task`. */
const DESC_DECL = /^\s*desc\s+"([^"]*)"|^\s*desc\s+'([^']*)'/

/** `end` at the start of a line (allowing leading whitespace), closing a block. */
const END_LINE = /^\s*end\b/

/** A line that opens some OTHER Ruby block a later `end` will close. */
const OTHER_BLOCK_KEYWORD = /^\s*(if|unless|case|begin|while|until|def|class|module|for)\b/
/** A line ending in a bare `do` (with optional block params), e.g. `task :t do |t|`. */
const ENDS_WITH_DO = /\bdo\s*(\|[^|]*\|)?\s*(#.*)?$/

/** One entry on the block stack: a namespace (which contributes to the task
 * path) or some other Ruby block (`if`, `def`, a `task … do`) that a later
 * `end` closes without affecting the path. Tracking both, rather than
 * popping the namespace stack on every `end`, is what keeps nesting correct
 * once a Rakefile has ordinary multi-line task bodies — `task :t do … end`
 * closes with `end` exactly like `namespace :ns do … end` does, so an
 * `end`-means-pop-namespace scanner would desync on the very first
 * multi-line task.
 */
type BlockEntry = { kind: 'namespace'; name: string } | { kind: 'other' }

/**
 * Walk a Rakefile's lines tracking open blocks and the most recent `desc`, so
 * a `task` sees both its enclosing namespaces and its doc when declared.
 *
 * `desc` is consumed by the very next `task` only — it does not leak forward
 * onto a second, unrelated task the way it would if we kept it around after a
 * match.
 */
export function scanTasks(text: string): ScannedTask[] {
  const out: ScannedTask[] = []
  const stack: BlockEntry[] = []
  let pendingDesc: string | undefined

  const namespacePath = (): string[] =>
    stack
      .filter((e): e is { kind: 'namespace'; name: string } => e.kind === 'namespace')
      .map((e) => e.name)

  for (const raw of text.split(/\r?\n/)) {
    const nsOpen = NAMESPACE_OPEN.exec(raw)
    if (nsOpen) {
      const ns = nsOpen[1] ?? nsOpen[2] ?? nsOpen[3]
      // Only open the block when the line truly ends with `do` (optionally
      // block params/a comment) — `namespace :db do; end` closes on the same
      // line, and pushing here regardless would desync the stack, silently
      // namespacing every task for the rest of the file under `db`.
      if (ns !== undefined && ENDS_WITH_DO.test(raw)) stack.push({ kind: 'namespace', name: ns })
      pendingDesc = undefined
      continue
    }

    const descMatch = DESC_DECL.exec(raw)
    if (descMatch) {
      pendingDesc = descMatch[1] ?? descMatch[2] ?? ''
      continue
    }

    const taskMatch = TASK_DECL.exec(raw)
    if (taskMatch) {
      const name = taskMatch[1] ?? taskMatch[2] ?? taskMatch[3]
      if (name !== undefined) {
        const path = [...namespacePath(), name].join(':')
        out.push({ path, ...(pendingDesc ? { doc: pendingDesc } : {}) })
      }
      pendingDesc = undefined
      if (ENDS_WITH_DO.test(raw)) stack.push({ kind: 'other' })
      continue
    }

    if (END_LINE.test(raw)) {
      stack.pop()
      pendingDesc = undefined
      continue
    }

    const trimmed = raw.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue

    // Any other non-blank, non-comment line clears a dangling `desc` — it was
    // for something this scanner does not (or will not) recognize as a task,
    // and must not silently attach to whatever task comes next.
    pendingDesc = undefined

    if (OTHER_BLOCK_KEYWORD.test(raw) || ENDS_WITH_DO.test(raw)) {
      stack.push({ kind: 'other' })
    }
  }

  return out
}
