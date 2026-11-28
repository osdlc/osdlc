/**
 * Shared fakes for the CLI tests: every tool installed, a `gh` with no open
 * PRs, and an environment that keeps a run off the person's real files.
 */

import { mkdirSync, realpathSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CommandRunner } from '@osdlc/command-seam'

import type { CliSeams } from '../src/cli.ts'
import type { Ports } from '../src/ports.ts'

/** A `PATH` lookup that finds every binary. */
export const allToolsInstalled = (binary: string): string => `/usr/bin/${binary}`

/** A `gh` that lists no PRs. */
export const emptyGh: CommandRunner = {
  run: () => ({ exitCode: 0, stdout: '[]', stderr: '' }),
}

/** The default remote the CLI fixtures give a repo, so the survey has a repository to list. */
export const FIXTURE_REMOTE = 'https://github.com/o/r.git'

/**
 * A `Ports.targetHome` that puts every repository's places under `dir`, as the standalone run
 * does under pr-update's directories: `worktrees/<host>/<owner>/<name>` and
 * `kept/<host>/<owner>/<name>`. Each test gives its own `dir`, since every fixture is `o/r`.
 */
export function homeUnder(dir: string): Ports['targetHome'] {
  return (t) => ({
    worktrees: join(dir, 'worktrees', t.host, t.owner, t.name),
    kept: join(dir, 'kept', t.host, t.owner, t.name),
    worktreesRoot: join(dir, 'worktrees'),
  })
}

/** Seams for a run where all tools exist and `gh` finds nothing. */
export const fakeTools: CliSeams = { which: allToolsInstalled, gh: emptyGh }

/**
 * An empty git config. `vitest.config.ts` points `GIT_CONFIG_GLOBAL` at it for
 * the whole suite, since git started by an in-process run inherits
 * `process.env`, not the run's own environment.
 */
export const EMPTY_GITCONFIG = fileURLToPath(new URL('./empty.gitconfig', import.meta.url))

/**
 * The environment for a run of the CLI, under the isolation rule of the
 * machine-files standard. Every home a run reads is inside `root`:
 *
 * - `HOME` (`USERPROFILE` on Windows), made under `root`, so `~` and the
 *   default checkout roots never reach the real home;
 * - `OSDLC_ROOT`, which moves pr-update's machine file, its trust store, its
 *   cache and state directories, and the family's `repositories.yaml`;
 * - `PR_UPDATE_ROOT`, for devlink's files, which have not moved under it;
 * - `XDG_STATE_HOME`, where the trust store was before it moved under
 *   `OSDLC_ROOT`, so a test of that old place never reads the real one.
 *
 * Every other variable that moves a file the run reads is left out, which
 * clears it: `OSDLC_<HOME>_DIR`, `OSDLC_REPOSITORIES`,
 * `PR_UPDATE_MACHINE_CONFIG`, `WAYFINDER_CONFIG`, and devlink's
 * `PR_UPDATE_HOME`, which picks the code a run executes. `vitest.config.ts`
 * blanks the file-level ones in `process.env` as well, since config-layers and
 * `@osdlc/ecosystem` read them there. git reads no global or system config.
 */
export function isolatedEnv(
  root: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  // Made, and by its real path: the default checkout roots compare real paths, and a home
  // that does not resolve would let them climb to the shared temp directory.
  mkdirSync(root, { recursive: true })
  const home = join(realpathSync.native(root), 'home')
  mkdirSync(home, { recursive: true })
  return {
    PATH: process.env.PATH ?? '',
    HOME: home,
    // Where Windows looks for the home directory instead.
    USERPROFILE: home,
    OSDLC_ROOT: join(root, 'osdlc'),
    PR_UPDATE_ROOT: join(root, 'pr-update'),
    XDG_STATE_HOME: join(root, 'state'),
    GIT_CONFIG_GLOBAL: EMPTY_GITCONFIG,
    GIT_CONFIG_NOSYSTEM: '1',
    ...extra,
  }
}

/** The worktree paths in `git worktree list --porcelain` output, in Node's form: git prints `C:/x` on Windows. */
export function worktreePaths(porcelain: string): string[] {
  return porcelain
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => normalize(l.slice('worktree '.length)))
}

/** `text` escaped for a `RegExp`, so a Windows path's backslashes match themselves. */
export function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
