/**
 * `@osdlc/host-cleaner/testing` (D9): what a plugin's own tests need, kept
 * out of the main entry so production code never imports it.
 *
 * - `fakeContext` is a hook's context with defaults.
 * - `fakeRunner` answers the kit's programs from a table and records them.
 * - `tempHome` is a temporary folder for a test's fixtures.
 * - `contractSuite` checks a plugin against the contract every plugin keeps.
 *
 * Nothing here depends on a test runner. The suite returns the problems it
 * found, so `expect(await contractSuite(plugin, ctx)).toEqual([])` reads well.
 */

import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { AsyncCommandRunner, AsyncCommandRunOptions } from '@osdlc/command-seam'
import { fakeRunner as seamRunner } from '@osdlc/command-seam/testing'
import { sameFingerprint } from '@osdlc/repo-cleaner'

import { PlanSchema } from './plan.ts'
import { OUTSIDE_ROOTS, plan, survey, type Survey } from './run.ts'
import { HOOKS, type Candidate, type Ctx, type PathCandidate, type Plugin } from './types.ts'

/** A hook's context: no targets, nothing allowed, and a signal that is never aborted, under `over`. */
export function fakeContext(over: Partial<Ctx> = {}): Ctx {
  return {
    cwd: process.cwd(),
    targets: [],
    allow: [],
    signal: new AbortController().signal,
    ...over,
  }
}

/** One program's answers, as command-seam's `fakeRunner` takes them: argv without the program. */
export type FakeAnswers = Parameters<typeof seamRunner>[0]

/** One call a {@link fakeRunner} received. */
export interface FakeKitCall {
  /** The program first, then its arguments. */
  argv: string[]
  opts: AsyncCommandRunOptions
}

/** What {@link fakeRunner} returns: `runner` and `which` are the kit's options of those names. */
export interface FakeKitRunner {
  runner: (program: string) => AsyncCommandRunner
  /** A program in the table is on PATH; any other is not. */
  which: (program: string) => string | undefined
  /** Every call, in order. */
  calls: FakeKitCall[]
}

/**
 * Fake programs for the kit: `programs` maps each program to its answers. A
 * program not in the table is not on PATH and fails to start; a call its
 * answers do not cover fails as command-seam's `fakeRunner` fails it. Spread
 * it into a plugin's kit options: `pluginKit(name, { ...fakeRunner({...}) })`.
 */
export function fakeRunner(programs: Readonly<Record<string, FakeAnswers>>): FakeKitRunner {
  const calls: FakeKitCall[] = []
  const fakes = new Map(
    Object.entries(programs).map(([program, answers]) => [program, seamRunner(answers)]),
  )
  return {
    calls,
    which: (program) => (fakes.has(program) ? `/fake/bin/${program}` : undefined),
    runner: (program) => ({
      binary: program,
      run: async (argv, opts) => {
        calls.push({ argv: [program, ...argv], opts: { ...opts } })
        const fake = fakes.get(program)
        if (fake !== undefined) return fake.asyncRunner.run(argv, opts)
        return {
          exitCode: 1,
          stdout: '',
          stderr: '',
          neverExited: true,
          reason: 'spawn',
          error: `fakeRunner: ${program} is not on PATH`,
        }
      },
    }),
  }
}

/** A temporary folder, by its real path, and how to remove it. */
export interface TempHome {
  home: string
  /** `HOME` set to {@link TempHome.home}, for a plugin's `env`. */
  env: Record<string, string>
  cleanup(): void
}

/**
 * A new empty folder under the system's temporary folder, by its real path so
 * a containment check compares like with like. It does not change this
 * process's `HOME`.
 */
export function tempHome(prefix = 'host-cleaner-home-'): TempHome {
  const home = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  return {
    home,
    env: { HOME: home },
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  }
}

/** Where in `value` a value is that JSON would change or drop, and what it is; null when there is none. */
function notJson(value: unknown, at: string): string | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null
  if (typeof value === 'number') return Number.isFinite(value) ? null : `${at} is ${value}`
  if (typeof value !== 'object') return `${at} is a ${typeof value}`
  if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) {
      const found = item === undefined ? `${at}[${i}] is undefined` : notJson(item, `${at}[${i}]`)
      if (found !== null) return found
    }
    return null
  }
  const proto = Object.getPrototypeOf(value) as unknown
  if (proto !== Object.prototype && proto !== null) {
    return `${at} is a ${(value as object).constructor?.name ?? 'class instance'}`
  }
  for (const [key, item] of Object.entries(value)) {
    // JSON leaves out a key that is undefined, which reads back the same.
    if (item === undefined) continue
    const found = notJson(item, `${at}.${key}`)
    if (found !== null) return found
  }
  return null
}

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/**
 * Checks `plugin` against the contract, surveying it twice over `ctx`, and
 * returns one line per problem, each starting with the plugin's name. Give it
 * a fixture where the plugin is detected and proposes at least one candidate,
 * or the checks have nothing to check. It checks that:
 * - its `limits` name hooks and are positive numbers of milliseconds;
 * - the survey warns of nothing: no hook throws or runs past its time limit,
 *   every candidate's id is unique, and each names the plugin as its owner
 *   and has one of a path and a ref;
 * - every path candidate is inside the plugin's roots or the targets;
 * - the ids, and each candidate's evidence, are the same in both surveys;
 * - candidates and objections hold only what JSON keeps (D14), and a plan of
 *   them reads back from JSON;
 * - `delete`, given a path candidate outside its roots and the targets,
 *   throws and leaves the folder there.
 */
export async function contractSuite(plugin: Plugin, ctx: Partial<Ctx> = {}): Promise<string[]> {
  const problems: string[] = []
  const say = (text: string): void => {
    problems.push(`${plugin.name}: ${text}`)
  }
  const run = fakeContext(ctx)

  const hooks = new Set<string>(HOOKS)
  for (const [hook, ms] of Object.entries(plugin.limits ?? {})) {
    if (!hooks.has(hook)) say(`limits names ${hook}, which is not a hook`)
    else if (ms !== undefined && !(Number.isFinite(ms) && ms > 0)) {
      say(`limits.${hook} is ${ms}; it must be a positive number of milliseconds`)
    }
  }

  let first: Survey
  let second: Survey
  try {
    first = await survey([plugin], run)
    second = await survey([plugin], run)
  } catch (err) {
    say(`the survey threw: ${errorText(err)}`)
    return problems
  }
  if (first.plugins.length === 0) {
    say('detect said no in this fixture, so nothing else could be checked')
    for (const w of first.warnings) say(`the survey warned: ${w}`)
    return problems
  }
  for (const w of first.warnings) say(`the survey warned: ${w}`)
  if (first.candidates.length === 0) {
    say('proposed no candidate in this fixture, so the candidate checks had nothing to check')
  }

  for (const o of first.objections) {
    if (o.code !== OUTSIDE_ROOTS) continue
    say(`proposed ${o.candidate}, which is not inside its roots or the targets: ${o.reason}`)
  }

  const again = new Map(second.candidates.map((c) => [c.id, c]))
  const before = new Set(first.candidates.map((c) => c.id))
  for (const c of first.candidates) {
    const later = again.get(c.id)
    if (later === undefined) say(`proposed ${c.id} in the first survey and not in the second`)
    else if (!sameFingerprint(c.evidence, later.evidence)) {
      say(
        `the evidence of ${c.id} changed between two surveys: ${JSON.stringify(c.evidence)} then ${JSON.stringify(later.evidence)}`,
      )
    }
  }
  for (const c of second.candidates) {
    if (!before.has(c.id)) say(`proposed ${c.id} in the second survey and not in the first`)
  }

  for (const c of first.candidates) {
    const found = notJson(c, 'candidate')
    if (found !== null) say(`${c.id} does not survive JSON: ${found}`)
  }
  for (const o of first.objections) {
    const found = notJson(o, 'objection')
    if (found !== null) say(`an objection to ${o.candidate} does not survive JSON: ${found}`)
  }
  try {
    PlanSchema.parse(JSON.parse(JSON.stringify(plan(first))))
  } catch (err) {
    say(`a plan of its survey does not read back from JSON: ${errorText(err)}`)
  }

  if (plugin.delete !== undefined) await escapedDelete(plugin, first, say)
  return problems
}

/** Calls `plugin.delete` on a folder outside its roots and the targets; it must throw and leave the folder. */
async function escapedDelete(
  plugin: Plugin,
  s: Survey,
  say: (text: string) => void,
): Promise<void> {
  const outside = tempHome('host-cleaner-outside-')
  try {
    const path = outside.home
    writeFileSync(join(path, 'keep'), 'not the plugin to delete')
    // Shaped like the plugin's own path candidates, so it fails on where it is, not what it is.
    const like = s.candidates.find((c): c is PathCandidate => c.path !== undefined)
    const kind = like?.kind ?? 'escaped'
    const c: Candidate = {
      id: `${kind}:${path}`,
      kind,
      owner: plugin.name,
      why: 'the contract suite: a folder outside the roots and the targets',
      path,
      evidence: { ...like?.evidence, path },
    }
    let said: string
    try {
      said = await plugin.delete!(c, { ...s.ctx, signal: new AbortController().signal })
    } catch {
      if (!existsSync(join(path, 'keep'))) {
        say(`delete removed ${path} before refusing it, which is outside its roots and the targets`)
      }
      return
    }
    say(
      existsSync(join(path, 'keep'))
        ? `delete returned "${said}" for ${path}, which is outside its roots and the targets; it must throw`
        : `delete removed ${path}, which is outside its roots and the targets`,
    )
  } finally {
    outside.cleanup()
  }
}
