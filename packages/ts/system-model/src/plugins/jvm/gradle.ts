/**
 * gradle — the tasks a Gradle build declares, with the conventional JVM
 * lifecycle verbs as a floor.
 *
 * Two paths, the shape `just` uses:
 *
 *   ask     `gradle tasks --all` (or `./gradlew tasks --all`) makes the build
 *           itself enumerate its tasks — every plugin-contributed task, every
 *           bespoke one, every subproject's, with the descriptions their
 *           authors wrote. Requires running the build's own tool.
 *   floor   synthesize `build`, `test`, `clean`, `assemble`, `check` — the
 *           lifecycle verbs the base and java plugins define, which nearly
 *           every Gradle build answers to. Names only, and conventions rather
 *           than an observation, but it works on a machine with no gradle and
 *           under `allowExec: false`, which is what makes this a `parse`
 *           runner at all.
 *
 * WHY ASKING IS THE ONLY WAY TO LEARN THE REAL LIST. `build.gradle` and
 * `build.gradle.kts` are Groovy and Kotlin — general-purpose languages, not
 * data formats. A task can be registered inside a loop, behind a condition,
 * from a convention plugin in `buildSrc`, or by a third-party plugin whose name
 * never appears next to the task it contributes. Parsing that text correctly
 * means embedding a Groovy/Kotlin interpreter and then running it, so scraping
 * would produce a confidently wrong answer. Gradle is the only component that
 * knows, which is exactly why the exec path exists.
 *
 * AND WHY RUNNING IT IS ALLOWED. `allowExec` is not a ban on running the
 * scanned repository's tools; it is the switch that says a person has
 * consented to exactly that, and the CLIs only turn it on behind a
 * repository-trust gate. A `parse` runner is one that still has an answer
 * WITHOUT the flag — which this one does, the floor below — not one that
 * refuses to use the flag when it is set.
 *
 * THE COST IS REAL AND NEW. Every millisecond-scale runner here reads
 * files; this one starts (or wakes) a Gradle daemon, resolves the
 * build's own plugin dependencies and COMPILES the build script to answer.
 * Cold that is seconds to minutes, and on a first run with an empty dependency
 * cache it is network-bound. So this asks gradle exactly ONCE per collection,
 * never once per project directory: `tasks --all` run against the root build
 * already enumerates every subproject's tasks under its own `sub:task` name
 * (docs.gradle.org/current/userguide/part5_build_scripts.html shows
 * `./gradlew tasks --all` from the root listing `app:greeting` and
 * `lib:task3`), so a second invocation would buy nothing and cost another
 * configuration. The call carries a generous but finite timeout and the
 * caller's abort signal.
 *
 * Every failure — no gradle, non-zero exit, timeout, output that does not
 * parse — lands on the floor with a diagnostic saying so. The task list is
 * never empty and nothing here throws.
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
    // Deliberately covers both paths. `chain` is a static property on the
    // runner, read by `collect()` when it assembles the report, so it cannot
    // describe the path a particular run took without mutating shared module
    // state under concurrent collections. Which path ran is carried per task by
    // `origin` (`declared` = gradle said so, `synthesized` = convention) and
    // stated outright in the run's diagnostics.
    hint:
      "A Gradle task. Read from `gradle tasks --all` when the build's own tool could be " +
      'run; otherwise one of the conventional lifecycle verbs a Gradle build answers to.',
  },
]

/**
 * The floor: lifecycle tasks the `base` and `java` plugins define, offered when
 * gradle itself could not be asked. Conventions, not config — and a task the
 * report DID list always wins over its entry here.
 */
const VERBS: ReadonlyArray<{ name: string }> = [
  { name: 'build' },
  { name: 'test' },
  { name: 'clean' },
  { name: 'assemble' },
  { name: 'check' },
]

/**
 * A generous cap. Gradle's answer is bounded by build-script compilation and
 * plugin resolution, not by the size of the listing: a warm daemon replies in
 * about a second, a cold JVM start plus configuration is tens of seconds, and
 * a first run against an empty dependency cache is network-bound and can take
 * minutes. Five minutes is chosen to be longer than an honest cold run and
 * short enough that a wedged daemon does not hang a catalog forever — the
 * timeout is a hard cap in `spawnRunnerAsync`, and hitting it falls to the
 * floor with a diagnostic rather than failing the runner.
 */
const PROBE_TIMEOUT_MS = 300_000

/**
 * A stepped block — Gradle's own mark is a stylized elephant, unrelated in
 * shape to anything this substitute could legally reproduce. simple-icons
 * ships a `gradle` entry (CC0-licensed, so no licensing bar the way
 * cargo.ts's `rust` or maven.ts's `apachemaven` face) but this package does
 * not copy artwork from any icon set regardless of its license — every brand
 * here is drawn fresh. Color (`#02303A`) is independently attested in
 * Gradle's own documentation stylesheet (gradle/gradle,
 * `platforms/documentation/docs/src/docs/css/base.css`), not lifted from
 * simple-icons' entry.
 */
const BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="15" width="6" height="5"/><rect x="9" y="9" width="6" height="5"/><rect x="14" y="3" width="6" height="5"/></svg>',
  color: '#02303A',
}

/**
 * Whether `./gradlew` should be preferred over the bare `gradle` binary for a
 * project directory.
 *
 * `cwd` never leaves `"."` (the standing policy: address the directory via
 * the tool's own flag, not by changing the working directory), so a wrapper
 * is only actually invocable as written when it sits at the repository root
 * — `./gradlew` run from root resolves there regardless of which directory
 * `-p` then points at, which is also how a real multi-project Gradle build
 * works: one wrapper at the root serves every subproject. A root wrapper is
 * therefore checked first and wins outright. Only when there is no root
 * wrapper does a wrapper sitting next to a nested build file matter, and only
 * for addressing that one project, since nothing else could reach it as a
 * relative path from root.
 */
async function wrapperArgv0(ctx: ProviderContext, dir: string): Promise<string> {
  if (await ctx.exists('gradlew')) return './gradlew'
  if (dir !== '.' && (await ctx.exists(`${dir}/gradlew`))) return `./${dir}/gradlew`
  return 'gradle'
}

export const gradleRunner: RunnerRole = {
  // `parse`, not `exec`: the synthesized floor means this runner always has
  // something to offer. It asks the build's own tool when allowed, and says
  // when it did not.
  kind: 'parse',
  chain: CHAIN,
  brand: BRAND,
  // This runner already lists these at any depth, so the value here is
  // catching a NEWLY ADDED one: re-hashing only the paths a previous run
  // recorded can never see a build script that did not exist then, and a new
  // `build.gradle` is a new set of tasks.
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
      // Deterministic pick when a directory carries more than one marker
      // (e.g. build.gradle.kts + settings.gradle.kts at the root): one task
      // set per directory, not one per file. `filesHere` is built above from
      // exactly `dir === "." ? m : `${dir}/${m}`` for each `m` in `GRADLE_FILES`
      // that `ctx.files` found, so this `find` always matches.
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
      // THE FLOOR NEVER REGRESSES. A verb gradle already listed keeps gradle's
      // own description and `origin: "declared"`; one it did not list is still
      // offered. A build with no `java` plugin genuinely has no `assemble`, so
      // this can over-offer — `origin` is what a caller filters on to see only
      // what the build actually asserted.
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
  // One addressing rule for both paths. `-p <dir>` is Gradle's own start
  // directory flag — "Specifies the start directory for Gradle. Defaults to
  // current directory."
  // (docs.gradle.org/current/userguide/command_line_interface.html) — so the
  // command is correct pasted from the repository root and `cwd` stays ".".
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
 * Returns an empty map on every path that is not a clean, parseable listing —
 * `allowExec` off, no invocable gradle, non-zero exit, timeout, unreadable
 * output — after appending the diagnostic that explains which of those it was.
 * An empty map means every directory falls back to the synthesized floor.
 */
async function askGradle(
  ctx: ProviderContext,
  dirs: string[],
  diagnostics: Diagnostic[],
): Promise<Map<string, ReportRow[]>> {
  const empty = new Map<string, ReportRow[]>()

  // The build to interrogate. A root build is the one worth asking: its
  // `tasks --all` covers the whole multi-project tree. With no build file at
  // the root there is no root build, so the first discovered directory is
  // asked instead and any others fall to the floor (noted below) — still one
  // invocation, never one per directory.
  const probeDir = dirs.includes('.') ? '.' : (dirs[0] ?? '.')
  const argv0 = await wrapperArgv0(ctx, probeDir)

  // WHAT `ctx.which` CAN AND CANNOT ANSWER HERE. It is a PATH lookup, so it is
  // the right question for the bare `gradle` binary and the WRONG question for
  // a wrapper: `ctx.which("./gradlew")` searches PATH for a name containing a
  // slash and finds nothing, and a wrapper repo — the overwhelmingly common
  // case, and one that deliberately has no bare gradle installed — would be
  // locked out of the exec path forever by asking it. So presence is settled
  // per argv0: a wrapper's existence was already proven by `ctx.exists` inside
  // `wrapperArgv0`, and only the bare-binary case consults PATH. This also
  // satisfies the rule that the probe must invoke the SAME binary the emitted
  // argv uses — both come from `wrapperArgv0`.
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
  // The flags, each deliberate:
  //
  //   -q               "Log errors only."
  //                    (command_line_interface.html). Drops the `> Task :tasks`
  //                    banner, the progress lines and `BUILD SUCCESSFUL`,
  //                    leaving the report. The parser tolerates them either
  //                    way — this is noise reduction, not a dependency.
  //   --console=plain  "Set to `plain` to generate plain text only. This
  //                    option disables all color and other rich output."
  //                    (command_line_interface.html). stdout here is a pipe,
  //                    so gradle's `auto` default would usually pick plain
  //                    anyway; passing it explicitly means a build that pins
  //                    `org.gradle.console=rich` in gradle.properties cannot
  //                    change the shape of what we parse.
  //   --no-daemon      NOT passed. It trades one cost for another and loses:
  //                    the daemon is documented as on by default ("Use the
  //                    Gradle Daemon to run the build. Starts the daemon if
  //                    not running or the existing daemon is busy. Default is
  //                    on."), so an already-warm daemon answers this probe in
  //                    about a second, and a daemon this probe starts is then
  //                    reused by the user's next build. `--no-daemon` forks a
  //                    throwaway JVM every time, paying full cold start here
  //                    and leaving nothing behind.
  //
  // No `--offline`: it would make configuration fail on any build whose
  // plugins are not already cached, turning a slow answer into no answer.
  const argv = [
    ...(probeDir === '.' ? [] : ['-p', probeDir]),
    '-q',
    '--console=plain',
    'tasks',
    '--all',
  ]
  const res = await ctx.runner(argv0).run(argv, {
    cwd: ctx.root,
    timeoutMs: PROBE_TIMEOUT_MS,
    signal: ctx.signal,
  })

  // `run` never rejects — a missing binary, a killed timeout and a build-script
  // compile error all arrive as a non-zero exit code.
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
    // A Gradle project path maps to a directory by convention: `:app:api` is
    // `app/api` below the build root. When that directory is one this scan
    // found a build file in, the task belongs there and is addressed with the
    // same `-p` form the floor uses. When it is not — a subproject declared in
    // settings with no build file of its own — the task is kept on the probed
    // build under its fully qualified `:app:api:name`, which is exactly how
    // gradle's own report named it and is invocable from the build root.
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
 * Verified against gradle's own documented output: the group heading over a
 * dashed underline and the `name - description` rows are in
 * docs.gradle.org/current/userguide/command_line_interface.html ("Build tasks /
 * ----------- / assemble - Assembles the outputs of this project."); a row with
 * NO description is in docs.gradle.org/current/userguide/bp_tasks.html, whose
 * `gradlew :app:tasks --all` sample lists a bare `generateDocs` beside
 * described siblings; subproject-qualified names under `--all` from the root
 * are in docs.gradle.org/current/userguide/part5_build_scripts.html, whose
 * `./gradlew tasks --all` sample lists `app:greeting` and `lib:task3`. The
 * `Rules` group carries task RULES, not tasks — "The string parameter provided
 * to the rule serves as a description that appears when listing available tasks
 * via the command line"
 * (docs.gradle.org/current/userguide/controlling_task_execution.html) — so its
 * rows are dropped by name below rather than by shape, since a `Pattern:` line
 * is prose.
 *
 * Structure carries the parse, not a guess at which words look like tasks: a
 * row counts only while directly under a `heading` + `same-length dashes`
 * pair, and a blank line closes the group. That keeps `BUILD SUCCESSFUL in
 * 2s`, the `> Task :tasks` banner, the `Tasks runnable from ...` header (whose
 * bracketing rules are 60 dashes, never its own length) and the trailing
 * `To see more detail about a task, run gradle help --task <task>` out without
 * having to enumerate them.
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
 * wrong:` prose, so the message is assembled from those lines. A missing
 * binary is called out by name because it is the one failure a user fixes by
 * installing something rather than by fixing their build.
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
