/**
 * Python — `[tool.*]` sections in a pyproject.toml, and declared scripts.
 *
 * The `[tool.*]` half is `synthesized`: declaring `[tool.ruff]` configures
 * ruff, it does not declare a task called "ruff". The convention that a
 * configured tool is a tool you run is the runner's inference, not the
 * repo's statement.
 *
 * The `[project.scripts]` / `[tool.poetry.scripts]` half is `declared`: the
 * project itself names these commands. What is inferred there is only how to
 * invoke them — `uv run <name>` or `poetry run <name>` — chosen from which
 * lock file sits next to the pyproject.toml, since a bare `pip install`'s
 * entry points are not reliably invocable without knowing which venv they
 * landed in.
 *
 * The `[tool.x]` test is a regex rather than a TOML parse on purpose — it needs
 * only to know whether a section header exists, which does not justify a TOML
 * dependency. The scripts extraction below does the same: a small inline-table
 * reader for the common case (bare keys, simple quoted string values), not a
 * TOML parser.
 */

import type { ProviderContext } from '../../contract.ts'
import type { Diagnostic, ProviderResult, RunnerBrand, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import { dirOf, joinRel, taskId } from '../support/shared.ts'
import { PYPROJECT_TOML } from './ecosystem.ts'
import { poetry, uv } from './managers.ts'

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
 * All five take a path positional, so the directory rides in `argv` and
 * `cwd` stays "." — the command is correct pasted from the repository root.
 * `pytest`/`pyright` take no path today (they default to the cwd they run
 * in); giving them the directory explicitly is equivalent at the root and
 * correct elsewhere.
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
 * Foundation; it is used here nominatively, to identify the tool. Icon
 * path: simple-icons v16 (CC0), slug `python`. Color is the same Python
 * brand blue simple-icons lists for it.
 */
const BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14.25.18l.9.2.73.26.59.3.45.32.34.34.25.34.16.33.1.3.04.26.02.2-.01.13V8.5l-.05.63-.13.55-.21.46-.26.38-.3.31-.33.25-.35.19-.35.14-.33.1-.3.07-.26.04-.21.02H8.77l-.69.05-.59.14-.5.22-.41.27-.33.32-.27.35-.2.36-.15.37-.1.35-.07.32-.04.27-.02.21v3.06H3.17l-.21-.03-.28-.07-.32-.12-.35-.18-.36-.26-.36-.36-.35-.46-.32-.59-.28-.73-.21-.88-.14-1.05-.05-1.23.06-1.22.16-1.04.24-.87.32-.71.36-.57.4-.44.42-.33.42-.24.4-.16.36-.1.32-.05.24-.01h.16l.06.01h8.16v-.83H6.18l-.01-2.75-.02-.37.05-.34.11-.31.17-.28.25-.26.31-.23.38-.2.44-.18.51-.15.58-.12.64-.1.71-.06.77-.04.84-.02 1.27.05zm-6.3 1.98l-.23.33-.08.41.08.41.23.34.33.22.41.09.41-.09.33-.22.23-.34.08-.41-.08-.41-.23-.33-.33-.22-.41-.09-.41.09zm13.09 3.95l.28.06.32.12.35.18.36.27.36.35.35.47.32.59.28.73.21.88.14 1.04.05 1.23-.06 1.23-.16 1.04-.24.86-.32.71-.36.57-.4.45-.42.33-.42.24-.4.16-.36.09-.32.05-.24.02-.16-.01h-8.22v.82h5.84l.01 2.76.02.36-.05.34-.11.31-.17.29-.25.25-.31.24-.38.2-.44.17-.51.15-.58.13-.64.09-.71.07-.77.04-.84.01-1.27-.04-1.07-.14-.9-.2-.73-.25-.59-.3-.45-.33-.34-.34-.25-.34-.16-.33-.1-.3-.04-.25-.02-.2.01-.13v-5.34l.05-.64.13-.54.21-.46.26-.38.3-.32.33-.24.35-.2.35-.14.33-.1.3-.06.26-.04.21-.02.13-.01h5.84l.69-.05.59-.14.5-.21.41-.28.33-.32.27-.35.2-.36.15-.36.1-.35.07-.32.04-.28.02-.21V6.07h2.09l.14.01zm-6.47 14.25l-.23.33-.08.41.08.41.23.33.33.23.41.08.41-.08.33-.23.23-.33.08-.41-.08-.41-.23-.33-.33-.23-.41-.08-.41.08z"/></svg>',
  color: '#3776ab',
}

export const pythonRunner: RunnerRole = {
  kind: 'parse',
  chain: CHAIN,
  brand: BRAND,
  // No `binary`: which manager runs a script (uv/poetry) is resolved per
  // project from its lock file, so a single static name would be wrong.

  async collect(ctx: ProviderContext): Promise<ProviderResult> {
    const projects = (await ctx.files(PYPROJECT_TOML)).sort()
    if (projects.length === 0) return { status: 'absent', tasks: [], diagnostics: [] }

    const tasks: Task[] = []
    const diagnostics: Diagnostic[] = []

    for (const file of projects) {
      const text = await ctx.readText(file)
      if (text === null) continue
      const dir = dirOf(file)
      for (const tool of TOOL_VERBS) {
        if (!hasToolSection(text, tool.name)) continue
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
      // `module:function` entry point. A name declared in both is unusual but
      // not forbidden — dedupe per file so it is offered once, not twice.
      const declared: Record<string, string> = {
        ...extractInlineTable(text, '[project.scripts]'),
        ...extractInlineTable(text, '[tool.poetry.scripts]'),
      }
      const names = Object.keys(declared)
      if (names.length === 0) continue

      const has = async (tool: typeof uv) => {
        for (const lock of tool.roles.packageManager?.lockfiles ?? []) {
          if (await ctx.exists(joinRel(dir, lock))) return true
        }
        return false
      }
      const manager = (await has(uv)) ? 'uv' : (await has(poetry)) ? 'poetry' : null

      if (manager === null) {
        diagnostics.push({
          severity: 'info',
          message:
            `${names.length} script(s) declared in pyproject.toml but no uv.lock or ` +
            "poetry.lock found nearby — a bare pip install's entry points aren't reliably " +
            "invocable without knowing the venv, so they're not offered as tasks",
          source: file,
        })
        continue
      }

      const emitted = new Set<string>()
      for (const name of names) {
        if (emitted.has(name)) continue
        emitted.add(name)
        // `uv run --project <dir>` and `poetry --directory <dir> run` both
        // put the directory in argv via the tool's own flag, so `cwd` stays
        // "." and the displayed command is correct pasted from the
        // repository root. Poetry's `--directory` is a global option, so it
        // precedes the `run` subcommand, the same way `--working-dir`
        // precedes Composer's subcommand.
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
          detail: declared[name],
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

/** `[tool.ruff]` or any sub-table of it, at the start of a line. */
export function hasToolSection(text: string, tool: string): boolean {
  const re = new RegExp(`^\\[tool\\.${escapeRegExp(tool)}(\\.[^\\]]+)?\\]`, 'm')
  return re.test(text)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Reads a simple TOML table of `key = "value"` pairs under an exact section
 * header, e.g. `[project.scripts]`. Out of scope on purpose: multi-line
 * strings, arrays, nested tables, and quoted/dotted keys — the header must
 * match `sectionHeader` verbatim (no sub-tables), and a line that isn't the
 * simple `bareKey = "value"` / `bareKey = 'value'` shape is skipped rather
 * than throwing. That covers the common case; anything fancier is a reason to
 * reach for a real TOML parser, which this file deliberately doesn't carry.
 */
export function extractInlineTable(text: string, sectionHeader: string): Record<string, string> {
  const header = escapeRegExp(sectionHeader)
  const headerRe = new RegExp(`^${header}\\s*$`, 'm')
  const match = headerRe.exec(text)
  if (match === null) return {}

  const rest = text.slice(match.index + match[0].length)
  const nextHeader = /^\[/m.exec(rest)
  const body = nextHeader === null ? rest : rest.slice(0, nextHeader.index)

  const out: Record<string, string> = {}
  const lineRe = /^([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*["']([^"']*)["']\s*(?:#.*)?$/
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    const m = lineRe.exec(line)
    if (m === null) continue
    const [, key, value] = m
    if (key !== undefined && value !== undefined) out[key] = value
  }
  return out
}
