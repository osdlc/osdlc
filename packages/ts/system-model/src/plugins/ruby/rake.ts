/**
 * rake: tasks from a Rakefile. rake lists them itself when that is allowed;
 * otherwise they are scanned from the source.
 *
 * Two paths, as in `just.ts`:
 *
 *   exec    `rake -AT` asks rake to list its own tasks. rake evaluates the
 *           Rakefile to do it, so this runs only when the caller passed
 *           `allowExec`. With the calling CLI's repository-trust check, that
 *           is the user's explicit consent to run this repository's tools.
 *   parse   a regex over the source. A Rakefile is Ruby, not data, so a scanner
 *           sees only `task :name do … end` and `namespace :ns do … end` as
 *           written. It cannot see tasks built by a loop
 *           (`%w[a b c].each { |n| task n }`), by metaprogramming, by
 *           `Rake::TestTask.new` and similar classes, by `import` or `load` of
 *           another file, or by `Dir.glob` over a directory of task files.
 *           `DYNAMIC_CONSTRUCTS` looks for these, so the runner warns instead
 *           of silently reporting too few tasks.
 *
 * The parse path is the fallback. It is why this can be a `parse` runner, and
 * it runs on a machine with no ruby or for a caller that did not allow
 * execution. The diagnostics always say which path ran. The warnings about
 * dynamic tasks are not emitted on the exec path: rake listed those tasks
 * there, so the warnings would be false.
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
 * Rakefile names, in the order rake resolves its entry point. Copied from
 * `Rake::Application::DEFAULT_RAKEFILES` (rake 13.3.1,
 * lib/rake/application.rb). rake tries them in this order and stops at the
 * first match.
 */
export const RAKEFILE_NAMES = ['rakefile', 'Rakefile', 'rakefile.rb', 'Rakefile.rb']

/** Task files a Rakefile loads. */
export const RAKE_TASK_FILES = '*.rake'

/**
 * The listing invocation. Each flag checked against `rake --help` on rake
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
 * `-AT` is rake's documented form of the pair. `-N` and `-G` keep rake inside
 * the tree. Without them rake searches parent directories or reads `~/.rake`,
 * and would then evaluate and report a Rakefile outside the tree this package
 * was asked to describe.
 *
 * The invocation runs with `cwd: ctx.root`, not `-C <dir>`, because it only
 * ever runs the root rakefile; see `collect`.
 *
 * No `RAKE_COLUMNS` in the environment, on purpose. rake truncates task
 * descriptions only when writing to a TTY or when that variable is set
 * (`Rake::Application#truncate_output?`, application.rb). Read through a pipe
 * with the variable unset, descriptions come back whole.
 */
const EXEC_ARGV = ['-AT', '-N', '-G']

/**
 * Evaluating a Rakefile can load a whole Rails environment, so the cap is
 * long. But a Rakefile that hangs must not hang the caller. A timeout falls
 * back to the parse path like any other failure.
 */
const EXEC_TIMEOUT_MS = 30_000

/**
 * One line of `rake -AT`, matched against rake's own format string
 * (`printf("#{name} %-#{width}s  # %s\n", t.name_with_args, comment)` in
 * `Rake::Application#display_tasks_and_comments`, application.rb). `name` there
 * is the literal `"rake"` the application initializes itself with.
 *
 * Strict on purpose. A loose pattern would turn a Rakefile's own `puts`
 * output, or a Ruby warning printed on stdout during evaluation, into tasks.
 * It requires the whole line: the `rake ` prefix, a name made of the
 * characters rake task names use, an optional `[arg,arg]` argument list
 * (`Rake::Task#name_with_args`, task.rb), at least two spaces, and the `#`.
 */
const LISTING_LINE = /^rake ([A-Za-z0-9_][A-Za-z0-9_.:/-]*)(?:\[([^\]\n]*)\])? {2,}# ?(.*)$/

/**
 * Constructs that create tasks a regex cannot see. Each one found adds a
 * warning, on the parse path only.
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
 * A glyph drawn here. simple-icons has no mark for rake (the `rake.com` and
 * `Rake` finance apps it lists are unrelated), so there is no third-party
 * artwork to license. The red is Ruby's community color, used on ruby-lang.org
 * and by rbenv. rake has no brand color of its own.
 */
const BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="11" y="9" width="2" height="13" rx="1"/><path d="M5 3h2l1.2 5H7L5.8 4H5V3Zm12 0h-2l-1.2 5H15l1.2-4H17V3ZM11 3h2l.6 5h-3.2L11 3Z"/><rect x="4" y="8" width="16" height="2.4" rx="1.2"/></svg>',
  color: '#cc342d',
}

export const rakeRunner: RunnerRole = {
  // `parse`, not `exec`: the scan means this runner always has tasks to offer.
  // It runs rake when allowed, and says when it did not.
  kind: 'parse',
  probe: { timeoutMs: EXEC_TIMEOUT_MS, cost: 'slow' },
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
        // First match wins, in RAKEFILE_NAMES order, the order rake uses.
        if (rootRakefile === undefined && dirOf(file) === '.') rootRakefile = file
      }
    }

    // `*.rake` matches by basename across the whole tree, not only in Rails'
    // `lib/tasks/`. Every `.rake` file is scanned like a Rakefile.
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

    // `ctx.which`, not a `--version` call: a PATH lookup answers the same
    // question without starting a process.
    const usable = ctx.allowExec && ctx.which('rake') !== null

    // One invocation, not one per file. rake loads the root Rakefile and
    // everything it pulls in (`import`, `load`, a `Dir.glob` over
    // `lib/tasks/*.rake`) into one task namespace, then prints it all. No
    // per-file invocation could say correctly which file a task came from. So
    // the exec path covers only the root rakefile. Its tasks get
    // `source: rootRakefile`, the entry point rake was given, and every other
    // file stays on the parse path.
    //
    // With no root rakefile there is no exec path. Running `rake` in a
    // directory without one would fail, or, with parent search on, evaluate a
    // Rakefile outside the tree. `-N` prevents the second case; this check
    // avoids the first.
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

      // Did the root invocation already list this file's tasks?
      //
      // `rake -AT` prints one flat namespace and never says which file a task
      // came from, so this is a guess, and it must be made per file. Dropping
      // every parsed name that appears anywhere in the listing would delete
      // real tasks: an unrelated `tools/plugin/tasks.rake` with its own `test`
      // would lose it to the root Rakefile's `test`, though the two have
      // different argv, ids and sources. Turning execution on must never make
      // the list shorter.
      //
      // The rule used instead: every task this file declares appears in the
      // listing. A `.rake` file the root Rakefile loaded always meets it. One
      // it never loaded fails as soon as it declares one name of its own.
      // `scanned.length > 0` stops the rule being true for an empty file: a
      // file with no visible task gives no signal, so it is treated as not
      // loaded and keeps its tasks and warnings.
      //
      // The remaining case is a `.rake` file that nothing loads and whose every
      // name happens to match a root task. It is dropped, on purpose. The other
      // rule (never dedupe) would show the very common Rails `lib/tasks/*.rake`
      // twice, once with the wrong `-C lib/tasks` form.
      if (
        listed !== undefined &&
        dotRake.has(file) &&
        scanned.length > 0 &&
        scanned.every((t) => listedNames.has(t.path))
      ) {
        // Skip the whole file: its tasks and its dynamic-task warnings, which
        // do not apply when rake itself listed these tasks.
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
 * Never throws and never rejects. `AsyncCommandRunner.run` turns a missing
 * binary, a timeout and an abort into a non-zero `exitCode`
 * (`spawnRunnerAsync`, `async.ts` in @osdlc/command-seam). So every failure
 * comes back as an `error` string, which the caller turns into a diagnostic
 * before falling back to the parse path.
 */
async function listViaRake(ctx: ProviderContext): Promise<{ tasks: ListedTask[]; error?: string }> {
  const res = await ctx.runner('rake').run(EXEC_ARGV, {
    cwd: ctx.root,
    signal: ctx.signal,
  })
  if (res.exitCode !== 0) {
    return { tasks: [], error: firstLine(stderrOrError(res), 'unknown failure') }
  }
  const tasks = parseListing(res.stdout)
  if (tasks.length === 0) {
    // rake exiting 0 with no line this parser recognizes does not mean the
    // repository has no tasks. Treat it as a failed listing so the parse path
    // runs.
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
 * `source` is the root rakefile, the entry point rake was given. One
 * invocation merged every loaded file into one namespace, so a per-file source
 * would be made up. `id`, `path`, `argv`, `display` and `cwd` match the parse
 * path's forms, so a task keeps its identity when a caller turns execution
 * on.
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
    // Placeholders appear only here. `argv` above runs as it is.
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
 * rake arguments are positional and always optional (a missing one arrives as
 * `nil`, not an error). rake has no variadic form. So both flags are fixed.
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
 * or `name:` dependency clause. Captures only the name. Dependencies are not
 * `Task.parameters`, because rake dependencies are not runtime inputs the way
 * a just parameter is.
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

/**
 * One entry on the block stack: a namespace (part of the task path) or some
 * other Ruby block (`if`, `def`, a `task … do`) that a later `end` closes
 * without changing the path. Both are tracked so nesting stays correct with
 * multi-line task bodies. `task :t do … end` closes with `end` just like
 * `namespace :ns do … end`, so a scanner that popped a namespace on every
 * `end` would go wrong at the first multi-line task.
 */
type BlockEntry = { kind: 'namespace'; name: string } | { kind: 'other' }

/**
 * Walk a Rakefile's lines, tracking open blocks and the most recent `desc`, so
 * each `task` gets its enclosing namespaces and its doc.
 *
 * A `desc` applies only to the next `task`. It is cleared after a match, so it
 * cannot attach to a later, unrelated task.
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
      // Open the block only when the line ends with `do` (optionally followed
      // by block params or a comment). `namespace :db do; end` closes on the
      // same line. Pushing it anyway would put every later task in the file
      // under `db`.
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

    // Any other non-blank, non-comment line clears a pending `desc`. It
    // belonged to something this scanner does not treat as a task, and must
    // not attach to the next task.
    pendingDesc = undefined

    if (OTHER_BLOCK_KEYWORD.test(raw) || ENDS_WITH_DO.test(raw)) {
      stack.push({ kind: 'other' })
    }
  }

  return out
}
