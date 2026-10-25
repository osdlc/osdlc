/**
 * How a python command reaches the project's environment: through uv or
 * poetry when one is the package's manager, else as it is.
 */

import type { RunnerContext } from '../../contract.ts'

/**
 * `argv` run in the environment of the package at `dir`: `uv run`,
 * `uv run --project <dir>`, `poetry run`, `poetry --directory <dir> run`, or
 * `argv` unchanged when neither uv nor poetry manages the package.
 */
export function inPythonEnv(ctx: RunnerContext, dir: string, argv: readonly string[]): string[] {
  const chosen = ctx.packageManagers(dir).find((c) => c.ecosystem === 'python')?.tool
  if (chosen === 'uv') {
    return dir === '.' ? ['uv', 'run', ...argv] : ['uv', 'run', '--project', dir, ...argv]
  }
  if (chosen === 'poetry') {
    return dir === '.' ? ['poetry', 'run', ...argv] : ['poetry', '--directory', dir, 'run', ...argv]
  }
  return [...argv]
}
