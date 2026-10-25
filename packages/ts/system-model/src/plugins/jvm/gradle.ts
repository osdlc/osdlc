/**
 * gradle: the tasks a Gradle build declares, with the conventional JVM
 * lifecycle verbs as a fallback.
 *
 * Two paths, as in `just`:
 *
 *   ask     `gradle tasks --all` (or `./gradlew tasks --all`) makes the build
 *           list its own tasks: every task from a plugin, every custom one,
 *           every subproject's, with the descriptions their authors wrote.
 *           This runs the build's own tool.
 *   floor   synthesize `build`, `test`, `clean`, `assemble`, `check`, the
 *           lifecycle verbs the base and java plugins define. Nearly every
 *           Gradle build has them. These are names only, and conventions, not
 *           observed tasks. But they work on a machine with no gradle and
 *           under `allowExec: false`, which is why this is a `parse` runner.
 *
 * Why only asking gives the real list: `build.gradle` and `build.gradle.kts`
 * are Groovy and Kotlin, general-purpose languages, not data formats. A task
 * can be registered in a loop, behind a condition, from a convention plugin in
 * `buildSrc`, or by a third-party plugin whose name never appears next to the
 * task. Parsing that text correctly means embedding a Groovy/Kotlin
 * interpreter and running it, so scraping would give a wrong answer. Only
 * Gradle knows, which is why the exec path exists.
 *
 * Why running it is allowed: `allowExec` does not forbid running the scanned
 * repository's tools. It is the switch that says a person has agreed to that,
 * and the CLIs turn it on only after a repository-trust check. A `parse`
 * runner is one that still has an answer without the flag (this one has the
 * floor), not one that refuses to use the flag when it is set.
 *
 * The cost is high. The other fast runners here read files. This one starts
 * (or wakes) a Gradle daemon, resolves the build's plugin dependencies and
 * compiles the build script. Cold, that takes seconds to minutes, and a first
 * run with an empty dependency cache waits on the network. So this asks
 * gradle once per collection, not once per project directory. `tasks --all`
 * on the root build already lists every subproject's tasks as `sub:task`
 * (docs.gradle.org/current/userguide/part5_build_scripts.html shows
 * `./gradlew tasks --all` from the root listing `app:greeting` and
 * `lib:task3`). A second call would add nothing and cost another
 * configuration. The call has a long but finite timeout and the caller's abort
 * signal.
 *
 * Every failure (no gradle, non-zero exit, timeout, output that does not
 * parse) falls back to the floor with a diagnostic. The task list is never
 * empty and nothing here throws.
 */

import { stderrOrError } from '@osdlc/command-seam'

import type { ProviderContext } from '../../contract.ts'
import type { Diagnostic, ProviderResult, RunnerBrand, Task, TaskOrigin } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import { dirOf, looksPersistent, taskId } from '../support/shared.ts'
import { GRADLE_FILES } from './ecosystem.ts'

const CHAIN = [
  { label: 'runner', hint: 'gradle builds, tests and packages JVM projects.' },
  {
    label: 'project',
    hint: 'The directory holding the build script. `.` is the root project.',
  },
  {
    label: 'verb',
    // Covers both paths on purpose. `chain` is a static property of the
    // runner, so it cannot describe the path one run took without changing
    // shared module state during concurrent collections. Each task's `origin`
    // says which path it came from (`declared` = gradle listed it,
    // `synthesized` = convention), and the run's diagnostics say so too.
    hint:
      "A Gradle task. Read from `gradle tasks --all` when the build's own tool could be " +
      'run; otherwise one of the conventional lifecycle verbs a Gradle build answers to.',
  },
]

/**
 * The floor: lifecycle tasks the `base` and `java` plugins define. Conventions,
 * not config. A task the report did list always wins over its entry here.
 */
const VERBS: ReadonlyArray<{ name: string }> = [
  { name: 'build' },
  { name: 'test' },
  { name: 'clean' },
  { name: 'assemble' },
  { name: 'check' },
]

/**
 * A long cap. Gradle's answer time depends on build-script compilation and
 * plugin resolution, not on the size of the listing. A warm daemon replies in
 * about a second. A cold JVM start plus configuration takes tens of seconds. A
 * first run with an empty dependency cache waits on the network and can take
 * minutes. Five minutes is longer than a normal cold run, and short enough
 * that a stuck daemon does not hang a catalog forever. `collect` applies it to
 * the call as a hard cap. Hitting it falls back to the floor with a
 * diagnostic; the runner does not fail.
 */
const PROBE_TIMEOUT_MS = 300_000

/**
 * A plain glyph of stepped blocks, not Gradle's elephant logo. simple-icons
 * has a CC0 `gradle` entry (no license problem, unlike cargo.ts's `rust` or
 * maven.ts's `apachemaven`), but this package does not copy artwork from any
 * icon set, whatever its license. Every brand glyph here is drawn fresh. The
 * color (`#02303A`) comes from Gradle's documentation stylesheet
 * (gradle/gradle, `platforms/documentation/docs/src/docs/css/base.css`), not
 * from simple-icons.
 */
export const GRADLE_BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="15" width="6" height="5"/><rect x="9" y="9" width="6" height="5"/><rect x="14" y="3" width="6" height="5"/></svg>',
  color: '#02303A',
}

/**
 * Whether `./gradlew` should be preferred over the bare `gradle` binary for a
 * project directory.
 *
 * `cwd` is always `"."`: tasks pass the directory with the tool's own flag
 * instead of changing the working directory. `./gradlew` run from the root
 * resolves there, whatever directory `-p` points at. A real multi-project
 * Gradle build works the same way: one wrapper at the root serves every
 * subproject. So a root wrapper is checked first and always wins. A wrapper
 * next to a nested build file is used only when there is no root wrapper, and
 * only for that one project, run by its path from the root.
 */
async function wrapperArgv0(ctx: ProviderContext, dir: string): Promise<string> {
  if (await ctx.exists('gradlew')) return './gradlew'
  if (dir !== '.' && (await ctx.exists(`${dir}/gradlew`))) return `./${dir}/gradlew`
  return 'gradle'
}

export const gradleRunner: RunnerRole = {
  // `parse`, not `exec`: the synthesized floor means this runner always has
  // tasks to offer. It asks the build's own tool when allowed.
  kind: 'parse',
  probe: { timeoutMs: PROBE_TIMEOUT_MS, cost: 'slow' },
  chain: CHAIN,
  // This runner already reads these at any depth. The watch is for a newly
  // added one: re-hashing only the paths a previous run recorded cannot see a
  // build script that did not exist then, and a new `build.gradle` means new
  // tasks.
  watch: [...GRADLE_FILES],

  async collect(ctx: ProviderContext): Promise<ProviderResult> {
    const byDir = new Map<string, string[]>()
    for (const marker of GRADLE_FILES) {
      const found = await ctx.files(marker)
      for (const file of found) {
        const dir = dirOf(file)
        const list = byDir.get(dir)
        if (list === undefined) byDir.set(dir, [file])
        else list.push(file)
      }
    }
    if (byDir.size === 0) return { status: 'absent', tasks: [], diagnostics: [] }

    const dirs = [...byDir.keys()].sort()
    const diagnostics: Diagnostic[] = []
    const declared = await askGradle(ctx, dirs, diagnostics)

    const tasks: Task[] = []
    const evidence: string[] = []

    for (const dir of dirs) {
      const filesHere = byDir.get(dir) ?? []
      if (filesHere.length === 0) continue
      // A fixed pick when a directory has more than one build file (such as
      // build.gradle.kts + settings.gradle.kts at the root): one task set per
      // directory, not one per file. `filesHere` holds exactly
      // `dir === "." ? m : `${dir}/${m}`` for each `m` in `GRADLE_FILES` that
      // `ctx.files` found, so this `find` always matches.
      const source = GRADLE_FILES.find((m) => filesHere.includes(dir === '.' ? m : `${dir}/${m}`))
      if (source === undefined) continue
      const sourcePath = dir === '.' ? source : `${dir}/${source}`
      evidence.push(...filesHere.sort())

      const argv0 = await wrapperArgv0(ctx, dir)
      const rows = declared.get(dir) ?? []
      const seen = new Set<string>()

      for (const row of rows) {
        if (seen.has(row.name)) continue
        seen.add(row.name)
        tasks.push(
          toTask({
            argv0,
            dir,
            sourcePath,
            name: row.name,
            doc: row.description,
            origin: 'declared',
          }),
        )
      }
      // The floor is always offered. A verb gradle listed keeps gradle's
      // description and `origin: "declared"`. A verb it did not list is still
      // offered. A build with no `java` plugin has no `assemble`, so this can
      // offer too much. A caller filters on `origin` to see only what the
      // build reported.
      for (const verb of VERBS) {
        if (seen.has(verb.name)) continue
        seen.add(verb.name)
        tasks.push(toTask({ argv0, dir, sourcePath, name: verb.name, origin: 'synthesized' }))
      }
    }

    return {
      status: 'ok',
      tasks,
      diagnostics,
    }
  },
}

function toTask(args: {
  argv0: string
  dir: string
  sourcePath: string
  name: string
  doc?: string | undefined
  origin: TaskOrigin
}): Task {
  const { argv0, dir, sourcePath, name, doc, origin } = args
  // One rule for both paths. `-p <dir>` is Gradle's start directory flag
  // ("Specifies the start directory for Gradle. Defaults to current
  // directory.", docs.gradle.org/current/userguide/command_line_interface.html).
  // So the command works when pasted at the repository root, and `cwd` stays ".".
  const argv = dir === '.' ? [argv0, name] : [argv0, '-p', dir, name]
  return {
    id: taskId('gradle', sourcePath, name),
    runner: 'gradle',
    path: ['gradle', dir, name],
    argv,
    cwd: '.',
    display: argv.join(' '),
    parameters: [],
    source: sourcePath,
    origin,
    ...(doc ? { doc } : {}),
    tags: ['gradle', 'jvm', dir],
    persistent: { value: looksPersistent(name), declared: false },
    executes: 'local',
  }
}

// ------------------------------------------------------------------ the probe

/** One row of the task report: a name, and the description if the author wrote one. */
interface ReportRow {
  name: string
  description?: string | undefined
}

/**
 * Ask gradle once, and map its answer onto the discovered project directories.
 *
 * Returns an empty map whenever there is no clean, parseable listing:
 * `allowExec` off, no gradle to run, non-zero exit, timeout, unreadable
 * output. Each case except `allowExec` off first appends a diagnostic that
 * says which it was. An empty map means every directory falls back to the
 * synthesized floor.
 */
async function askGradle(
  ctx: ProviderContext,
  dirs: string[],
  diagnostics: Diagnostic[],
): Promise<Map<string, ReportRow[]>> {
  const empty = new Map<string, ReportRow[]>()

  // The build to ask. A root build is best: its `tasks --all` covers the
  // whole multi-project tree. With no build file at the root, the first
  // directory found is asked instead, and the others fall back to the floor
  // (noted below). Still one call, never one per directory.
  const probeDir = dirs.includes('.') ? '.' : (dirs[0] ?? '.')
  const argv0 = await wrapperArgv0(ctx, probeDir)

  // `ctx.which` is a PATH lookup. It is right for the bare `gradle` binary and
  // wrong for a wrapper: `ctx.which("./gradlew")` searches PATH for a name
  // with a slash and finds nothing. A wrapper repo is by far the common case,
  // and often has no bare gradle installed, so asking `which` would always
  // block it from the exec path. `wrapperArgv0` already checked a wrapper
  // exists with `ctx.exists`, so only the bare binary consults PATH. The probe
  // and the emitted argv also run the same binary, since both come from
  // `wrapperArgv0`.
  const invocable = argv0 !== 'gradle' || ctx.which('gradle') !== null

  if (!ctx.allowExec) return empty
  if (!invocable) {
    diagnostics.push({
      severity: 'warning',
      message:
        "`gradle` is not on the PATH and this build has no `gradlew` wrapper, so the build's " +
        'real task list could not be read — the tasks below are the conventional lifecycle ' +
        'verbs, not what this build declares',
    })
    return empty
  }

  // `tasks --all` — "Running `gradle tasks` gives you a list of the main tasks
  // of the selected project" and "You can obtain more information in the task
  // listing using the `--all` option"
  // (docs.gradle.org/current/userguide/command_line_interface.html). `--all` is
  // what adds the ungrouped tasks and the subprojects':
  // "Tasks which have not been assigned to a task group, so-called hidden
  // tasks, can be included in the report by enabling the command line option
  // `--all`" (docs.gradle.org/current/dsl/
  // org.gradle.api.tasks.diagnostics.TaskReportTask.html).
  //
  // The flags:
  //
  //   -q               "Log errors only."
  //                    (command_line_interface.html). Drops the `> Task :tasks`
  //                    banner, the progress lines and `BUILD SUCCESSFUL`,
  //                    leaving the report. The parser handles them either
  //                    way; this only cuts noise.
  //   --console=plain  "Set to `plain` to generate plain text only. This
  //                    option disables all color and other rich output."
  //                    (command_line_interface.html). stdout here is a pipe,
  //                    so gradle's `auto` default would usually pick plain
  //                    anyway. Passing it means a build that sets
  //                    `org.gradle.console=rich` in gradle.properties cannot
  //                    change the format we parse.
  //   --no-daemon      Not passed. The daemon is on by default ("Use the
  //                    Gradle Daemon to run the build. Starts the daemon if
  //                    not running or the existing daemon is busy. Default is
  //                    on."). A warm daemon answers this probe in about a
  //                    second, and a daemon this probe starts is reused by the
  //                    user's next build. `--no-daemon` starts a throwaway JVM
  //                    every time, pays the full cold start, and leaves
  //                    nothing behind.
  //
  // No `--offline`: configuration would fail on any build whose plugins are
  // not cached yet, so a slow answer would become no answer.
  const argv = [
    ...(probeDir === '.' ? [] : ['-p', probeDir]),
    '-q',
    '--console=plain',
    'tasks',
    '--all',
  ]
  const res = await ctx.runner(argv0).run(argv, {
    cwd: ctx.root,
    signal: ctx.signal,
  })

  // `run` never rejects. A missing binary, a timeout and a build-script
  // compile error all come back as a non-zero exit code.
  if (res.exitCode !== 0) {
    diagnostics.push({
      severity: 'warning',
      message: `${failureMessage(argv0, res.exitCode, stderrOrError(res), res.stdout)} — falling back to the conventional lifecycle verbs`,
    })
    return empty
  }

  const rows = parseTaskReport(res.stdout.trim().length > 0 ? res.stdout : res.stderr)
  if (rows.length === 0) {
    diagnostics.push({
      severity: 'warning',
      message:
        `\`${argv0} tasks --all\` succeeded but its listing could not be read — the report ` +
        'format may have changed; falling back to the conventional lifecycle verbs',
    })
    return empty
  }

  const known = new Set(dirs)
  const byDir = new Map<string, ReportRow[]>()
  const push = (dir: string, row: ReportRow) => {
    const list = byDir.get(dir)
    if (list === undefined) byDir.set(dir, [row])
    else list.push(row)
  }

  for (const row of rows) {
    // By convention a Gradle project path maps to a directory: `:app:api` is
    // `app/api` below the build root. If this scan found a build file in that
    // directory, the task goes there and uses the same `-p` form as the floor.
    // If not (a subproject declared in settings with no build file of its
    // own), the task stays on the probed build under its full `:app:api:name`.
    // That is the name gradle's report used, and it runs from the build root.
    const at = row.name.lastIndexOf(':')
    if (at === -1) {
      push(probeDir, row)
      continue
    }
    const segments = row.name.slice(0, at).split(':').filter(Boolean)
    const rel = segments.join('/')
    const dir = probeDir === '.' ? rel : `${probeDir}/${rel}`
    if (known.has(dir)) push(dir, { ...row, name: row.name.slice(at + 1) })
    else push(probeDir, row)
  }

  const uncovered = dirs.filter((d) => d !== probeDir && !byDir.has(d))
  diagnostics.push({
    severity: 'info',
    message:
      `\`${argv0} ${argv.join(' ')}\` was run: ${rows.length} task(s) come from the build itself` +
      (uncovered.length > 0
        ? `, and ${uncovered.length} directory/directories outside that build (${uncovered.join(', ')}) keep the conventional lifecycle verbs`
        : ''),
  })

  return byDir
}

/**
 * The task report's console form.
 *
 *     ------------------------------------------------------------
 *     Tasks runnable from project ':app'
 *     ------------------------------------------------------------
 *
 *     Build tasks
 *     -----------
 *     assemble - Assembles the outputs of this project.
 *
 *     Other tasks
 *     -----------
 *     generateDocs
 *     app:greeting
 *
 *     Rules
 *     -----
 *     Pattern: clean<TaskName>: Cleans the output files of a task.
 *
 * Checked against gradle's documented output:
 * - The group heading over a dashed underline and the `name - description`
 *   rows are in docs.gradle.org/current/userguide/command_line_interface.html
 *   ("Build tasks / ----------- / assemble - Assembles the outputs of this
 *   project.").
 * - A row with no description is in
 *   docs.gradle.org/current/userguide/bp_tasks.html, whose
 *   `gradlew :app:tasks --all` sample lists a bare `generateDocs` next to rows
 *   with descriptions.
 * - Subproject-qualified names under `--all` from the root are in
 *   docs.gradle.org/current/userguide/part5_build_scripts.html, whose
 *   `./gradlew tasks --all` sample lists `app:greeting` and `lib:task3`.
 * - The `Rules` group holds task rules, not tasks ("The string parameter
 *   provided to the rule serves as a description that appears when listing
 *   available tasks via the command line",
 *   docs.gradle.org/current/userguide/controlling_task_execution.html). Its
 *   rows are dropped by group name, not by shape, since a `Pattern:` line is
 *   prose.
 *
 * The parse relies on structure, not on guessing which words look like tasks.
 * A row counts only under a heading followed by dashes of the same length, and
 * a blank line ends the group. That keeps out `BUILD SUCCESSFUL in 2s`, the
 * `> Task :tasks` banner, the `Tasks runnable from ...` header (its rules are
 * 60 dashes, never its own length) and the trailing
 * `To see more detail about a task, run gradle help --task <task>`, without
 * listing them.
 */
export function parseTaskReport(output: string): ReportRow[] {
  const rows: ReportRow[] = []
  const seen = new Set<string>()
  const lines = output.split(/\r?\n/)
  let group: string | null = null

  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] ?? '').trim()
    if (line.length === 0) {
      group = null
      continue
    }
    const next = (lines[i + 1] ?? '').trim()
    if (/^-+$/.test(next) && next.length === line.length) {
      group = line
      i += 1
      continue
    }
    if (group === null || group === 'Rules') continue
    const m = /^:?([A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z0-9_.-]+)*)(?:\s+-\s+(\S.*?))?$/.exec(line)
    if (m === null) continue
    const name = m[1]!
    if (seen.has(name)) continue
    seen.add(name)
    rows.push({ name, description: m[2] })
  }
  return rows
}

/**
 * Gradle prints the useful part of a failure as `FAILURE:` / `* What went
 * wrong:` text, so the message is built from those lines. A missing binary
 * gets its own message because the user fixes it by installing something, not
 * by fixing the build.
 */
function failureMessage(argv0: string, exitCode: number, stderr: string, stdout: string): string {
  const combined = `${stderr}\n${stdout}`
  if (
    exitCode === 127 ||
    /command not found|ENOENT|not recognized|Permission denied/i.test(combined)
  ) {
    return `\`${argv0}\` could not be run`
  }
  const lines = combined
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const at = lines.findIndex((l) => l.startsWith('* What went wrong:'))
  const detail = at === -1 ? lines.find((l) => l.startsWith('FAILURE:')) : lines[at + 1]
  return detail === undefined
    ? `\`${argv0} tasks --all\` exited ${exitCode}`
    : `\`${argv0} tasks --all\` failed: ${detail}`
}
