/**
 * Python: `[tool.*]` sections in a pyproject.toml, and declared scripts.
 *
 * Tasks from `[tool.*]` are `synthesized`. `[tool.ruff]` configures ruff; it
 * does not declare a task called "ruff". Treating a configured tool as a tool
 * you run is this runner's guess, not something the repo states.
 *
 * Tasks from `[project.scripts]` / `[tool.poetry.scripts]` are `declared`: the
 * project names these commands. Only the way to run them is inferred:
 * `uv run <name>` or `poetry run <name>`, picked from the package's python
 * manager. A plain `pip install` gives no reliable way to run the entry points
 * without knowing which venv they went into.
 *
 * Both kinds re-read `pyproject.toml` through `ctx` and parse it with the
 * parser detection uses, so a second collect sees edits. The script manager
 * comes from `ctx.packageManagers`, so the profile and the task list agree.
 */

import type { Diagnostic, ProviderResult, RunnerBrand, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import { taskId } from '../support/shared.ts'
import { parsePyproject } from './ecosystem.ts'

const CHAIN = [
  { label: 'runner', hint: 'Python tooling configured in a pyproject.toml.' },
  { label: 'project', hint: 'The directory holding the pyproject.toml.' },
  {
    label: 'tool',
    hint:
      'A tool the project configures (synthesized from its `[tool.*]` section), ' +
      'or a script it declares in `[project.scripts]` / `[tool.poetry.scripts]`.',
  },
]

/**
 * Configured tool → the argv that runs it in check mode against a directory.
 * All five accept a path argument, so the directory goes in `argv` and `cwd`
 * stays ".". The command then works when pasted at the repository root.
 * `pytest` and `pyright` default to the directory they run in, so passing the
 * directory changes nothing at the root and is correct elsewhere.
 */
const TOOL_VERBS: ReadonlyArray<{ name: string; argv: (dir: string) => string[] }> = [
  { name: 'black', argv: (dir) => ['black', '--check', dir] },
  { name: 'mypy', argv: (dir) => ['mypy', dir] },
  { name: 'pyright', argv: (dir) => ['pyright', dir] },
  { name: 'pytest', argv: (dir) => ['pytest', dir] },
  { name: 'ruff', argv: (dir) => ['ruff', 'check', dir] },
]

/**
 * The Python two-snake mark, a trademark of the Python Software
 * Foundation, used here only to identify the tool. Icon
 * path: simple-icons v16 (CC0), slug `python`. Color is the same Python
 * brand blue simple-icons lists for it.
 */
export const PYTHON_BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14.25.18l.9.2.73.26.59.3.45.32.34.34.25.34.16.33.1.3.04.26.02.2-.01.13V8.5l-.05.63-.13.55-.21.46-.26.38-.3.31-.33.25-.35.19-.35.14-.33.1-.3.07-.26.04-.21.02H8.77l-.69.05-.59.14-.5.22-.41.27-.33.32-.27.35-.2.36-.15.37-.1.35-.07.32-.04.27-.02.21v3.06H3.17l-.21-.03-.28-.07-.32-.12-.35-.18-.36-.26-.36-.36-.35-.46-.32-.59-.28-.73-.21-.88-.14-1.05-.05-1.23.06-1.22.16-1.04.24-.87.32-.71.36-.57.4-.44.42-.33.42-.24.4-.16.36-.1.32-.05.24-.01h.16l.06.01h8.16v-.83H6.18l-.01-2.75-.02-.37.05-.34.11-.31.17-.28.25-.26.31-.23.38-.2.44-.18.51-.15.58-.12.64-.1.71-.06.77-.04.84-.02 1.27.05zm-6.3 1.98l-.23.33-.08.41.08.41.23.34.33.22.41.09.41-.09.33-.22.23-.34.08-.41-.08-.41-.23-.33-.33-.22-.41-.09-.41.09zm13.09 3.95l.28.06.32.12.35.18.36.27.36.35.35.47.32.59.28.73.21.88.14 1.04.05 1.23-.06 1.23-.16 1.04-.24.86-.32.71-.36.57-.4.45-.42.33-.42.24-.4.16-.36.09-.32.05-.24.02-.16-.01h-8.22v.82h5.84l.01 2.76.02.36-.05.34-.11.31-.17.29-.25.25-.31.24-.38.2-.44.17-.51.15-.58.13-.64.09-.71.07-.77.04-.84.01-1.27-.04-1.07-.14-.9-.2-.73-.25-.59-.3-.45-.33-.34-.34-.25-.34-.16-.33-.1-.3-.04-.25-.02-.2.01-.13v-5.34l.05-.64.13-.54.21-.46.26-.38.3-.32.33-.24.35-.2.35-.14.33-.1.3-.06.26-.04.21-.02.13-.01h5.84l.69-.05.59-.14.5-.21.41-.28.33-.32.27-.35.2-.36.15-.36.1-.35.07-.32.04-.28.02-.21V6.07h2.09l.14.01zm-6.47 14.25l-.23.33-.08.41.08.41.23.33.33.23.41.08.41-.08.33-.23.23-.33.08-.41-.08-.41-.23-.33-.33-.23-.41-.08-.41.08z"/></svg>',
  color: '#3776ab',
}

export const pythonRunner: RunnerRole = {
  kind: 'parse',
  chain: CHAIN,
  async collect(ctx, packages): Promise<ProviderResult> {
    const tasks: Task[] = []
    const diagnostics: Diagnostic[] = []

    for (const pkg of packages) {
      const file = pkg.manifests.pyproject?.manifestPath
      if (file === undefined) continue
      // Read through ctx, not the profile's facts, so a second collect sees
      // edits and the cache records what was read.
      const text = await ctx.readText(file)
      if (text === null) continue
      const fact = parsePyproject(text, file)
      if (fact.error !== undefined) {
        diagnostics.push({ severity: 'warning', message: fact.error, source: file })
        continue
      }
      const dir = pkg.dir
      for (const tool of TOOL_VERBS) {
        if (!fact.tools.includes(tool.name)) continue
        const argv = tool.argv(dir)
        tasks.push({
          id: taskId('python', file, tool.name),
          runner: 'python',
          path: ['python', dir, tool.name],
          argv,
          cwd: '.',
          display: argv.join(' '),
          parameters: [],
          source: file,
          origin: 'synthesized',
          tags: ['python', tool.name, dir],
          persistent: { value: false, declared: false },
          executes: 'local',
        })
      }

      // `[project.scripts]` (PEP 621) and `[tool.poetry.scripts]` (Poetry)
      // declare the same shape of thing: a command name mapped to a
      // `module:function` entry point.
      const names = Object.keys(fact.scripts)
      if (names.length === 0) continue

      // Only uv and poetry run a script inside the project's environment.
      const chosen = ctx.packageManagers(dir).find((c) => c.ecosystem === 'python')?.tool
      const manager = chosen === 'uv' || chosen === 'poetry' ? chosen : null
      if (manager === null) {
        diagnostics.push({
          severity: 'info',
          message:
            `${names.length} script(s) declared in pyproject.toml but no uv.lock or ` +
            "poetry.lock found — a bare pip install's entry points aren't reliably " +
            "invocable without knowing the venv, so they're not offered as tasks",
          source: file,
        })
        continue
      }

      for (const name of names) {
        // `uv run --project <dir>` and `poetry --directory <dir> run` put the
        // directory in argv with the tool's own flag. `cwd` stays ".", so the
        // displayed command works when pasted at the repository root.
        // Poetry's `--directory` is a global option, so it goes before `run`.
        const argv =
          dir === '.'
            ? [manager, 'run', name]
            : manager === 'uv'
              ? ['uv', 'run', '--project', dir, name]
              : ['poetry', '--directory', dir, 'run', name]
        tasks.push({
          id: taskId('python', file, name),
          runner: 'python',
          path: ['python', dir, name],
          argv,
          cwd: '.',
          display: argv.join(' '),
          detail: fact.scripts[name],
          parameters: [],
          source: file,
          origin: 'declared',
          tags: ['python', name, dir, manager],
          persistent: { value: false, declared: false },
          executes: 'local',
        })
      }
    }

    return {
      status: tasks.length > 0 ? 'ok' : 'absent',
      tasks,
      diagnostics,
    }
  },
}
