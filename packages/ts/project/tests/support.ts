/**
 * Test support: fake runners, fixture roots, and a detect-then-collect helper.
 *
 * The point of injecting `ctx.runner` is visible here: the moon and just
 * runners are tested against RECORDED output, so their suites need no moon
 * binary, no `.moon/` fixture workspace, and no coupling to whatever moon
 * version happens to be installed. A format change in moon's JSON then shows up
 * as a deliberate fixture update rather than as a suite that passes on one
 * machine and fails on another.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { AsyncCommandRunOptions, AsyncCommandRunner, CommandResult } from '@osdlc/command-seam'

import { builtins } from '../src/builtins.ts'
import type { CollectOptions, DetectOptions } from '../src/contract.ts'
import type { Catalog } from '../src/model.ts'
import { createProject, type Project } from '../src/project.ts'
import type { ProjectProfile, ToolDef } from '../src/tool.ts'

/** One canned response, keyed by the argv it answers. */
export interface Canned {
  binary: string
  /** Matched as a prefix of argv, so `["query","tasks"]` answers any flags after. */
  argv: string[]
  stdout?: string
  stderr?: string
  exitCode?: number
  /** A seam failure the child never reached, such as `spawn gradle ENOENT`: sets `neverExited` and `reason: 'spawn'`. */
  error?: string
}

export interface FakeRunners {
  make: (binary: string) => AsyncCommandRunner
  /**
   * Every call made, in order — so a test can assert what was NOT run.
   *
   * `opts` is recorded alongside the argv because the run options are part of
   * what a runner promises: a probe that drops `timeoutMs` or `signal` still
   * returns the right tasks in a test, and the caller only finds out when a
   * real tool hangs. Recording them is what lets a suite assert they were sent.
   */
  calls: Array<{ binary: string; argv: string[]; opts: AsyncCommandRunOptions }>
}

/**
 * A runner factory backed by canned responses. An unmatched call resolves to a
 * non-zero exit rather than throwing, which is what a missing binary looks
 * like — the case the just runner's fallback exists for.
 */
export function fakeRunners(canned: Canned[]): FakeRunners {
  const calls: Array<{ binary: string; argv: string[]; opts: AsyncCommandRunOptions }> = []

  const make = (binary: string): AsyncCommandRunner => ({
    async run(argv: string[], opts: AsyncCommandRunOptions): Promise<CommandResult> {
      calls.push({ binary, argv, opts })
      const hit = canned.find((c) => c.binary === binary && c.argv.every((a, i) => argv[i] === a))
      if (hit === undefined) {
        return { exitCode: 127, stdout: '', stderr: `${binary}: command not found` }
      }
      return {
        exitCode: hit.exitCode ?? (hit.error === undefined ? 0 : 1),
        stdout: hit.stdout ?? '',
        stderr: hit.stderr ?? '',
        ...(hit.error === undefined
          ? {}
          : { neverExited: true, reason: 'spawn' as const, error: hit.error }),
      }
    },
  })

  return { make, calls }
}

/**
 * A `which` stand-in backed by a fixed map, so a suite can assert tool
 * presence without depending on what happens to be installed on the machine
 * running the test.
 */
export function fakeWhich(present: Record<string, string>): (binary: string) => string | null {
  return (binary) => present[binary] ?? null
}

/** A throwaway directory tree. `files` maps root-relative paths to contents. */
export async function fixtureRoot(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'osdlc-project-'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, content, 'utf-8')
  }
  return root
}

export async function removeRoot(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true })
}

/** `moon query tasks` output for one project with the given task ids. */
export function moonTasksJson(project: string, tasks: Record<string, unknown>): string {
  return JSON.stringify({ tasks: { [project]: tasks } })
}

/** `moon query projects` output for one project. */
export function moonProjectsJson(projects: unknown[]): string {
  return JSON.stringify({ projects })
}

/** Options for {@link collect}: detection and collection options, plus the tools. */
export type HarnessOptions = DetectOptions &
  CollectOptions & {
    /** The tools to register. Defaults to every built-in. */
    tools?: readonly ToolDef[] | undefined
  }

/** Detect `root`, then collect, with the same options for both. */
export async function collect(root: string, options: HarnessOptions = {}): Promise<Catalog> {
  return (await detectAndCollect(root, options)).catalog
}

/** {@link collect}, keeping the project and the profile for further questions. */
export async function detectAndCollect(
  root: string,
  options: HarnessOptions = {},
): Promise<{ project: Project; profile: ProjectProfile; catalog: Catalog }> {
  const { tools, ...rest } = options
  const project = createProject({ tools: tools ?? builtins })
  const profile = await project.detect(root, rest)
  const catalog = await project.runners.collect(profile, rest)
  return { project, profile, catalog }
}
