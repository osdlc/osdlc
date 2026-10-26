/**
 * sbt — https://www.scala-sbt.org
 *
 * `kind: "exec"`. An sbt build is a Scala program. `build.sbt` is compiled,
 * and `project/*.scala` and `project/plugins.sbt` extend it. Almost every task
 * people run (`compile`, `test`, `publishLocal`, `assembly`, `scalafmtAll`)
 * comes from a plugin and does not appear in the build files as text. Only sbt
 * itself knows the task set.
 *
 * There is no parse fallback. `just` has one because its recipe headers are
 * literal text at column 0, one per recipe. Scraping `build.sbt` for
 * `taskKey[Unit]("foo")` would find only the build's few custom keys and miss
 * all the conventional ones. The catalog would then claim to understand `sbt`
 * while leaving out `test`. Reporting nothing is better. `mise` makes the same
 * choice.
 *
 * The cost is high. sbt is the slowest exec runner here: mise answers in
 * milliseconds, and moon is slow only when a first query installs a toolchain.
 * sbt starts a JVM, resolves the build's own dependencies and compiles the build
 * definition. That takes 10-30s cold, and can take minutes on a first run with
 * an empty ivy/coursier cache. So this asks sbt once, with both commands in a
 * single JVM, and accepts a coarser answer instead of asking per project (see
 * `collect`).
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
 * `project/build.properties` pins `sbt.version` and the launcher reads it. So
 * every real sbt build has it, including builds defined only in
 * `project/*.scala` with no `build.sbt`.
 *
 * Root `*.sbt` files are markers too. sbt loads every `.sbt` file in the base
 * directory, so a build may use `dependencies.sbt` and no `build.sbt`. Only
 * root files count. `project/plugins.sbt` describes the meta-build. A nested
 * `core/build.sbt` is not a separate build: sbt subprojects are declared in the
 * root build.sbt (`lazy val core = project.in(file("core"))`), and
 * `core/build.sbt` only adds settings to that project. Treating it as a marker
 * would report a second sbt build that no one can run.
 */
export const VERSION_MARKER = 'project/build.properties'

/**
 * The Scala mark. simple-icons has no `sbt` slug, and the Scala mark is the
 * one people recognize. Scala is a trademark of EPFL, used here only to
 * identify the ecosystem. Icon path: simple-icons v16 (CC0), slug `scala`. Color is
 * the same Scala brand red simple-icons lists for it.
 */
export const SBT_BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.589 24c4.537 0 13.81-1.516 14.821-3v-5.729c-.957 1.408-10.284 2.912-14.821 2.912V24zM4.589 16.365c4.537 0 13.81-1.516 14.821-3V7.636c-.957 1.408-10.284 2.912-14.821 2.912v5.817zM4.589 8.729c4.537 0 13.81-1.516 14.821-3V0C18.453 1.408 9.126 2.912 4.589 2.912v5.817z"/></svg>',
  color: '#dc322f',
}

export const sbtRunner: RunnerRole = {
  kind: 'exec',
  // A cold sbt start compiles the build definition and can take minutes.
  probe: { timeoutMs: 300_000, cost: 'slow' },
  chain: CHAIN,
  // Watch every `*.sbt`, not only the root ones this runner reads. sbt also
  // loads nested ones, so a new subproject `.sbt` changes the task set.
  // `project/**` (plugins and build definitions) has no basename to watch, so
  // it relies on the exec max age.
  watch: [SBT_FILES],

  async collect(ctx: ProviderContext): Promise<ProviderResult> {
    const markers: string[] = []
    const rootSbtFiles = (await ctx.files(`/${SBT_FILES}`)).sort()
    markers.push(...rootSbtFiles)
    if (await ctx.exists(VERSION_MARKER)) markers.push(VERSION_MARKER)
    if (markers.length === 0) return { status: 'absent', tasks: [], diagnostics: [] }

    // One invocation, two commands. sbt runs each trailing argument as a
    // command in the same session, so `projects tasks` costs one JVM start
    // instead of two.
    //
    // `tasks`, not `tasks -V`. The verbose form lists every internal key in the
    // build (`compileIncremental`, `dependencyClasspath`, `bgRun`): a hundred or
    // so rows nobody types. The default listing is the set sbt considers
    // commonly used.
    //
    // sbt has no machine-readable task listing. Its structured channel is BSP
    // (it writes `.bsp/sbt.json` and speaks JSON-RPC over a long-lived server
    // connection). BSP lists build targets and compile/test/run capabilities,
    // not task keys, and needs a session handshake this package should not
    // manage. `sbt --client` (the `sbtn` thin client) only reuses a server
    // that is already running. It prints the same text and does not help the
    // cold start, which is the usual case. So this parses the console listing.
    const res = await ctx
      .runner('sbt')
      .run(['-batch', '-Dsbt.log.noformat=true', 'projects', 'tasks'], {
        cwd: ctx.root,
        signal: ctx.signal,
      })

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

    // sbt writes its listings to stdout. A build that logs to stderr still has
    // its listing in stdout, and joining both would double rows. So read
    // stdout, and use stderr only if stdout is empty.
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
      // sbt lists tasks for the current project only. Asking per project means
      // `project X; tasks` in a new session per subproject, one JVM start each.
      // Instead the listing is copied to the build's other projects. That is
      // right when they share the build's plugin set (the common case). The
      // copies are `synthesized` because sbt did not list them. A caller that
      // wants only what sbt reported filters on `origin`.
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
  // sbt's scoped-key syntax: `core/test`. The bare form runs in the project sbt
  // loads as current, the build's root, so the root's tasks need no prefix.
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
 * The two-space separator keeps the command's prose header out ("This is a
 * list of tasks defined for the current project." uses single spaces). The
 * required description keeps project ids out, since they have none. This is
 * scraped text, and a looser pattern would turn sentences into tasks.
 */
export function parseTaskRows(output: string): TaskRow[] {
  const out: TaskRow[] = []
  const seen = new Set<string>()
  for (const raw of output.split(/\r?\n/)) {
    const line = strip(raw)
    if (line === null) continue
    const m = /^\s+([A-Za-z][A-Za-z0-9_-]*)\s{2,}(\S.*)$/.exec(line)
    if (m === null) continue
    const name = m[1]!
    if (seen.has(name)) continue
    seen.add(name)
    out.push({ name, description: m[2]!.trimEnd() })
  }
  return out
}

/**
 * sbt reports build failures as `[error]` lines, and the exit code alone says
 * nothing useful, so the message is built from those lines. A missing binary
 * gets its own message because the user fixes it by installing sbt, not by
 * fixing the build.
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
