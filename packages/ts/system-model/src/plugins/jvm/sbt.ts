/**
 * sbt — https://www.scala-sbt.org
 *
 * `kind: "exec"`. An sbt build is a Scala PROGRAM: `build.sbt` is compiled,
 * `project/*.scala` and `project/plugins.sbt` extend it, and almost every task a
 * person actually runs — `compile`, `test`, `publishLocal`, `assembly`,
 * `scalafmtAll` — is contributed by a plugin and appears nowhere in the build
 * files as text. The only component that knows the task set is sbt itself.
 *
 * NO PARSE FALLBACK, unlike `just`, whose recipe headers are literal text at
 * column 0 mapping one-to-one onto recipes. Scraping `build.sbt` for
 * `taskKey[Unit]("foo")` would find only a build's handful of bespoke keys and
 * miss the entire conventional set, so the catalog would claim `sbt` was
 * understood while omitting `test`. An honest absence is better, the same call
 * `mise` makes.
 *
 * The cost is real: every other exec runner here answers in milliseconds; sbt
 * boots a JVM, resolves the build's own dependencies and compiles the build
 * definition, which is 10-30s cold and can be minutes on a first run with an
 * empty ivy/coursier cache. That is why this asks sbt exactly ONCE, batching
 * both commands into a single JVM, and why it accepts a coarser answer rather
 * than paying per project (see `collect`).
 */

import { stderrOrError } from '@osdlc/command-seam'

import type { ProviderContext } from '../../contract.ts'
import type { Diagnostic, ProviderResult, RunnerBrand, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import { looksPersistent, taskId } from '../support/shared.ts'
import { SBT_FILES } from './ecosystem.ts'

const CHAIN = [
  {
    label: 'runner',
    hint: 'sbt builds Scala and Java projects. Its tasks come from the build definition and from the plugins the build enables.',
  },
  {
    label: 'project',
    hint: "Which subproject the task runs in. The build's default project is addressed bare; any other is addressed `project/task`.",
  },
  {
    label: 'task',
    hint: "The task name, as sbt's own `tasks` command lists it.",
  },
]

/**
 * `project/build.properties` pins `sbt.version` and is what the launcher reads,
 * so it is present in every real sbt build — including ones whose definition
 * lives entirely in `project/*.scala` with no `build.sbt` at all.
 *
 * Root `*.sbt` is a marker too: sbt loads EVERY `.sbt` file in the base
 * directory, so a build may be spelled `dependencies.sbt` with no `build.sbt`.
 * Only the root ones count — `project/plugins.sbt` describes the meta-build,
 * and a nested `core/build.sbt` is not a build of its own: sbt subprojects are
 * declared in the ROOT build.sbt (`lazy val core = project.in(file("core"))`),
 * and a `core/build.sbt` merely adds settings to a project the root already
 * declared. Treating it as a marker would invent a second sbt build that no one
 * can invoke.
 */
export const VERSION_MARKER = 'project/build.properties'

/**
 * The Scala mark — the ecosystem symbol sbt builds for; simple-icons has
 * no `sbt` slug, and the Scala mark is the recognizable one. Scala is a
 * trademark of EPFL; it is used here nominatively, to identify the
 * ecosystem. Icon path: simple-icons v16 (CC0), slug `scala`. Color is
 * the same Scala brand red simple-icons lists for it.
 */
const BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.589 24c4.537 0 13.81-1.516 14.821-3v-5.729c-.957 1.408-10.284 2.912-14.821 2.912V24zM4.589 16.365c4.537 0 13.81-1.516 14.821-3V7.636c-.957 1.408-10.284 2.912-14.821 2.912v5.817zM4.589 8.729c4.537 0 13.81-1.516 14.821-3V0C18.453 1.408 9.126 2.912 4.589 2.912v5.817z"/></svg>',
  color: '#dc322f',
}

export const sbtRunner: RunnerRole = {
  kind: 'exec',
  chain: CHAIN,
  brand: BRAND,
  // This runner uses ROOT `*.sbt` files only; sbt loads the build from
  // nested ones too, so a newly added subproject `.sbt` changes the task set
  // without changing anything read here. `project/**` — plugins and build
  // definitions — has no watchable basename and rides the exec max age.
  watch: [SBT_FILES],

  async collect(ctx: ProviderContext): Promise<ProviderResult> {
    const markers: string[] = []
    const rootSbtFiles = (await ctx.files(`/${SBT_FILES}`)).sort()
    markers.push(...rootSbtFiles)
    if (await ctx.exists(VERSION_MARKER)) markers.push(VERSION_MARKER)
    if (markers.length === 0) return { status: 'absent', tasks: [], diagnostics: [] }

    // ONE invocation, two commands. sbt runs each trailing argument as a
    // command in the same session, so `projects tasks` costs one JVM start
    // instead of two.
    //
    // `tasks` rather than `tasks -V`: the verbose form dumps every internal key
    // in the build (`compileIncremental`, `dependencyClasspath`, `bgRun`), which
    // is a hundred-odd rows of things nobody types. The default listing is the
    // set sbt itself considers commonly used.
    //
    // There is NO machine-readable listing to prefer here. sbt's structured
    // channel is BSP — it writes `.bsp/sbt.json` and speaks JSON-RPC over a
    // long-lived server connection — which enumerates build targets and
    // compile/test/run capabilities, not the build's task keys, and which costs
    // a session handshake this package has no business owning. `sbt --client`
    // (the `sbtn` thin client) only reuses an already-running server; it emits
    // the same human text and does not help the cold case that dominates here.
    // So: parse the console listing.
    const res = await ctx
      .runner('sbt')
      .run(['-batch', '-Dsbt.log.noformat=true', 'projects', 'tasks'], { cwd: ctx.root })

    if (res.exitCode !== 0) {
      return {
        status: 'error',
        tasks: [],
        diagnostics: [
          {
            severity: 'error',
            message: failureMessage(res.exitCode, stderrOrError(res), res.stdout),
          },
        ],
      }
    }

    // sbt writes its listings to stdout through the logger, but a build that
    // logs to stderr still has its answer in stdout; joining both would double
    // rows, so read stdout and fall back only if it is empty.
    const output = res.stdout.trim().length > 0 ? res.stdout : res.stderr
    const projects = parseProjects(output)
    const rows = parseTaskRows(output)
    const source = markers[0] ?? VERSION_MARKER

    const diagnostics: Diagnostic[] = []
    if (rows.length === 0) {
      diagnostics.push({
        severity: 'warning',
        message:
          'sbt ran but its `tasks` listing could not be read — the output format may have changed',
        source,
      })
    }

    const current = projects.find((p) => p.current)?.id ?? 'root'
    const others = projects.filter((p) => !p.current).map((p) => p.id)

    const tasks: Task[] = []
    for (const row of rows) {
      tasks.push(toTask({ project: current, qualify: false, row, source, origin: 'declared' }))
      // sbt lists tasks for the CURRENT project only, and asking per project
      // means `project X; tasks` in a fresh session per subproject — a JVM
      // start each. Instead the listing is replicated across the build's other
      // projects, which is right whenever they share the build's plugin set
      // (the common case) and marked `synthesized` because sbt did not say so.
      // A caller that wants only what sbt asserted filters on `origin`.
      for (const project of others) {
        tasks.push(toTask({ project, qualify: true, row, source, origin: 'synthesized' }))
      }
    }

    if (others.length > 0) {
      diagnostics.push({
        severity: 'info',
        message: `sbt listed tasks for \`${current}\`; the same tasks are offered for ${others.length} sibling project(s) as \`sbt <project>/<task>\` without being confirmed`,
        source,
      })
    }

    return {
      status: 'ok',
      tasks,
      diagnostics,
    }
  },
}

interface TaskRow {
  name: string
  description?: string | undefined
}

interface SbtProject {
  id: string
  current: boolean
}

function toTask(args: {
  project: string
  /** Whether the name needs its `project/` prefix — the current project does not. */
  qualify: boolean
  row: TaskRow
  source: string
  origin: 'declared' | 'synthesized'
}): Task {
  const { project, qualify, row, source, origin } = args
  // sbt's scoped-key syntax: `core/test`. The bare form runs in whatever project
  // sbt loads as current, which is the build's root — so qualifying the root's
  // own tasks would add noise without adding meaning.
  const addressed = qualify ? `${project}/${row.name}` : row.name
  const argv = ['sbt', addressed]
  return {
    id: taskId('sbt', source, `${project}/${row.name}`),
    runner: 'sbt',
    path: ['sbt', project, row.name],
    argv,
    cwd: '.',
    display: argv.join(' '),
    parameters: [],
    source,
    origin,
    ...(row.description ? { doc: row.description } : {}),
    tags: ['sbt', project],
    persistent: { value: looksPersistent(row.name), declared: false },
    executes: 'local',
  }
}

/** sbt prefixes every logged line with a level tag; the listings are `[info]`. */
function strip(line: string): string | null {
  const m = /^\[(\w+)\]\s?(.*)$/.exec(line)
  if (m === null) return line
  return m[1] === 'info' ? (m[2] ?? '') : null
}

/**
 * The `projects` listing:
 *
 *     [info] In file:/home/user/demo/
 *     [info]   * parent
 *     [info]     sub
 *
 * `*` marks the project sbt loaded as current. A build can reference other
 * builds by URI, each with its own `In file:` heading; every id listed is
 * addressable from this session, so they are all collected.
 */
function parseProjects(output: string): SbtProject[] {
  const out: SbtProject[] = []
  const seen = new Set<string>()
  let inSection = false
  for (const raw of output.split(/\r?\n/)) {
    const line = strip(raw)
    if (line === null) continue
    if (/^\s*In\s+\S+:/.test(line)) {
      inSection = true
      continue
    }
    if (!inSection) continue
    const m = /^\s+(\*\s+)?([A-Za-z0-9][A-Za-z0-9_.-]*)\s*$/.exec(line)
    if (m === null) {
      // Anything that is not an indented bare id ends the listing — the `tasks`
      // header follows it and must not be mistaken for a project.
      if (line.trim().length > 0) inSection = false
      continue
    }
    const id = m[2]!
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, current: m[1] !== undefined })
  }
  return out
}

/**
 * The `tasks` listing: an indented name, two-or-more spaces, a description.
 *
 *     [info]   clean    Deletes files produced by the build...
 *
 * The two-space separator is what keeps the command's prose header out ("This
 * is a list of tasks defined for the current project." separates its words with
 * one space), and the leading indent is what keeps a project id out — those
 * carry no description. This is scraped text: a loose expression turns
 * sentences into tasks.
 */
function parseTaskRows(output: string): TaskRow[] {
  const out: TaskRow[] = []
  const seen = new Set<string>()
  for (const raw of output.split(/\r?\n/)) {
    const line = strip(raw)
    if (line === null) continue
    const m = /^\s+([A-Za-z][A-Za-z0-9_-]*)\s{2,}(\S.*?)\s*$/.exec(line)
    if (m === null) continue
    const name = m[1]!
    if (seen.has(name)) continue
    seen.add(name)
    out.push({ name, description: m[2]! })
  }
  return out
}

/**
 * sbt reports build failures as `[error]` lines and says nothing useful on the
 * exit code alone, so the message is assembled from those. A missing binary is
 * called out by name because it is the one failure the user fixes by installing
 * something rather than by fixing their build.
 */
function failureMessage(exitCode: number, stderr: string, stdout: string): string {
  const combined = `${stderr}\n${stdout}`
  if (exitCode === 127 || /command not found|ENOENT|not recognized/i.test(combined)) {
    return "`sbt` is not on the PATH — install sbt to list this build's tasks"
  }
  const errors = combined
    .split(/\r?\n/)
    .filter((l) => l.trim().startsWith('[error]'))
    .map((l) => l.trim().replace(/^\[error\]\s?/, ''))
    .filter(Boolean)
  if (errors.length > 0) return errors.slice(0, 8).join('\n')
  const first = combined
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)[0]
  return first ?? `sbt exited ${exitCode}`
}
