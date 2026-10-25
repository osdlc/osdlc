/**
 * VS Code tasks: the `tasks` array of each `.vscode/tasks.json`.
 *
 * The file is JSONC: comments and trailing commas are allowed. The folder
 * holding `.vscode/` is the workspace folder, and a task runs there unless
 * `options.cwd` says otherwise.
 *
 * What runs:
 *
 *   - `type: process`: `command` is the program and `args` its arguments.
 *   - `type: shell`: `command` and `args` form one command line. A line of
 *     plain words is split into argv. A line with shell syntax (a pipe, a
 *     quote, a `$`) or a leading `NAME=value` runs as `sh -c <line>`, on
 *     every platform.
 *   - `type: npm`: the package script, through the package's manager, the
 *     same argv the node-scripts runner gives it.
 *
 * Other types (`gulp`, `typescript`, an extension's own) and a task with no
 * command, which only runs its `dependsOn`, need VS Code and are skipped. A
 * second task with a label already seen is skipped with a diagnostic. The
 * old `0.1.0` format is not read.
 *
 * The file's top-level `options` are each task's defaults. The override for
 * the current platform (`windows`, `linux` or `osx`), at the top level and on
 * the task, is applied over them, as VS Code does.
 *
 * `${workspaceFolder}` (and its old name `${workspaceRoot}`) and
 * `${workspaceFolderBasename}` are expanded to this machine's paths. Any
 * other `${...}` variable (`${file}`, `${input:name}`, `${env:NAME}`) is
 * filled in by the editor, so the task keeps it as written and is marked
 * `parametersUnknown: 'editor-variable'`. A shell line with such a variable
 * and shell syntax stays one `sh -c` line, with the variable in place.
 */

import { isAbsolute, join, relative, resolve, sep } from 'node:path'

import type { RunnerContext } from '../../contract.ts'
import type { Diagnostic, ProviderResult, RunnerBrand, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import { parseJsonc } from '../support/jsonc.ts'
import {
  baseName,
  dependencies,
  dirOf,
  isTable,
  joinRel,
  shLineArgs,
  taskId,
} from '../support/shared.ts'

const CHAIN = [
  { label: 'runner', hint: 'VS Code runs the tasks a `.vscode/tasks.json` declares.' },
  { label: 'folder', hint: 'The workspace folder holding `.vscode/`. `.` is the root.' },
  { label: 'task', hint: "The task's `label`." },
]

/** A plain glyph: a checklist. VS Code's mark is in no CC0 icon set. Color: VS Code's blue. */
export const VSCODE_TASKS_BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 7 2 2 4-4M4 16l2 2 4-4M13 7h7M13 16h7"/></svg>',
  color: '#007acc',
}

/** Characters that make a command line need a shell. */
const SHELL_SYNTAX = /[|&;<>()$`\\"'*?[\]#~{}!\n]/

const KNOWN = /\$\{(workspaceFolder|workspaceRoot|workspaceFolderBasename)\}/g

/** A leading `NAME=value` word, which only a shell reads as an assignment. */
const ASSIGNMENT = /^\s*[A-Za-z_][A-Za-z0-9_]*=/

/** The key of the current platform's override in tasks.json. */
const PLATFORM_KEY =
  process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux'

/**
 * `entry` with `defaults` under it and its platform override over it. Keys
 * merge one level deep, and `options` one more, as VS Code merges them.
 */
function withOverrides(
  entry: Record<string, unknown>,
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  const layers = [defaults, entry, isTable(entry[PLATFORM_KEY]) ? entry[PLATFORM_KEY] : {}]
  const out: Record<string, unknown> = {}
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      out[key] =
        key === 'options' && isTable(value) && isTable(out[key])
          ? { ...(out[key] as Record<string, unknown>), ...value }
          : value
    }
  }
  return out
}

export const vscodeTasksRunner: RunnerRole = {
  kind: 'parse',
  chain: CHAIN,

  async collect(ctx: RunnerContext): Promise<ProviderResult> {
    const tasks: Task[] = []
    const diagnostics: Diagnostic[] = []
    for (const file of await tasksFiles(ctx)) {
      const text = await ctx.readText(file)
      if (text === null) continue
      let doc: unknown
      try {
        doc = parseJsonc(text)
      } catch (err) {
        const message = `unparseable tasks.json: ${err instanceof Error ? err.message : String(err)}`
        diagnostics.push({ severity: 'warning', message, source: file })
        continue
      }
      if (isTable(doc) && doc['version'] === '0.1.0') {
        diagnostics.push({
          severity: 'warning',
          message: 'tasks.json version 0.1.0 is not read; VS Code converts it to 2.0.0',
          source: file,
        })
        continue
      }
      const list = isTable(doc) && Array.isArray(doc['tasks']) ? doc['tasks'] : []
      const top = isTable(doc) ? withOverrides(doc, {}) : {}
      const defaults = isTable(top['options']) ? { options: top['options'] } : {}
      const folder = dirOf(dirOf(file))
      const labels = list.map(labelOf).filter((l): l is string => l !== undefined)
      const skipped: string[] = []
      const seen = new Set<string>()

      for (const raw of list) {
        const label = labelOf(raw)
        if (!isTable(raw) || label === undefined) {
          diagnostics.push({
            severity: 'warning',
            message: 'a task with no label was skipped',
            source: file,
          })
          continue
        }
        if (seen.has(label)) {
          diagnostics.push({
            severity: 'warning',
            message: `task ${label} is declared more than once; the first was kept`,
            source: file,
          })
          continue
        }
        seen.add(label)
        const entry = withOverrides(raw, defaults)
        const expand = (s: string): string =>
          s.replace(KNOWN, (_m, name: string) =>
            name === 'workspaceFolderBasename'
              ? baseName(folder === '.' ? ctx.root : folder)
              : join(ctx.root, folder),
          )
        const run = runOf(ctx, entry, folder, expand)
        if (run === null) {
          skipped.push(label)
          continue
        }
        if ('error' in run) {
          diagnostics.push({ severity: 'warning', message: `${label}: ${run.error}`, source: file })
          continue
        }
        const background = entry['isBackground'] === true
        const deps = entry['dependsOn']
        tasks.push({
          id: taskId('vscode-tasks', file, label),
          runner: 'vscode-tasks',
          path: ['vscode-tasks', folder, label],
          argv: run.argv,
          cwd: run.cwd,
          display: run.argv.join(' '),
          parameters: [],
          ...(run.argv.some((a) => /\$\{[^{}]*\}/.test(a))
            ? { parametersUnknown: 'editor-variable' as const }
            : {}),
          source: file,
          origin: 'declared',
          ...(typeof entry['detail'] === 'string' ? { doc: entry['detail'] } : {}),
          ...(run.detail === undefined ? {} : { detail: run.detail }),
          ...dependencies(
            (typeof deps === 'string' ? [deps] : Array.isArray(deps) ? deps : []).filter(
              (d): d is string => typeof d === 'string',
            ),
            (dep) => (labels.includes(dep) ? taskId('vscode-tasks', file, dep) : undefined),
          ),
          tags: ['vscode-tasks', folder, run.type],
          persistent: { value: background, declared: background },
          executes: 'local',
        })
      }
      if (skipped.length > 0) {
        diagnostics.push({
          severity: 'info',
          message: `tasks that only VS Code can run were skipped: ${skipped.join(', ')}`,
          source: file,
        })
      }
    }
    return { status: tasks.length > 0 ? 'ok' : 'absent', tasks, diagnostics }
  },

  /**
   * A `sh -c` line takes its arguments as `"$@"`, so each stays one word. It
   * refuses them when the line has more than one command or ends in a `#`
   * comment. Anything else appends them.
   */
  invoke(task, args) {
    return shLineArgs(task, args) ?? [...task.argv, ...args]
  },
}

/** Every `.vscode/tasks.json`, at any depth. */
export async function tasksFiles(ctx: { files(p: string): Promise<string[]> }): Promise<string[]> {
  return (await ctx.files('.vscode/'))
    .filter((f) => f === '.vscode/tasks.json' || f.endsWith('/.vscode/tasks.json'))
    .sort()
}

type Run = { argv: string[]; cwd: string; type: string; detail?: string } | { error: string }

/** What one entry runs, an error, or `null` when only VS Code can run it. */
function runOf(
  ctx: RunnerContext,
  entry: Record<string, unknown>,
  folder: string,
  expand: (s: string) => string,
): Run | null {
  const type = typeof entry['type'] === 'string' ? entry['type'] : 'process'
  const cwd = cwdOf(ctx, entry, folder, expand)
  if (cwd === null) return { error: 'options.cwd is outside the repository, so it was skipped' }

  if (type === 'npm') {
    const script = entry['script']
    if (typeof script !== 'string') return null
    const rel = typeof entry['path'] === 'string' ? entry['path'].replace(/(?<!\/)\/+$/, '') : ''
    const dir = rel === '' ? folder : joinRel(folder, rel)
    return { argv: npmScript(ctx, dir, script), cwd: '.', type, detail: `npm script ${script}` }
  }
  if (type !== 'shell' && type !== 'process') return null

  const command = valueOf(entry['command'])
  if (command === undefined || command.length === 0) return null
  const args = Array.isArray(entry['args']) ? entry['args'].map(valueOf) : []
  if (args.some((a) => a === undefined)) return { error: 'an argument is not a string' }
  const literal = (args as string[][]).flat()

  if (type === 'process') return { argv: [...command, ...literal].map(expand), cwd, type }
  // A shell task's command is a command line; its args are words VS Code quotes.
  const line = command.join(' ')
  const plain = line.replace(KNOWN, '').replace(/\$\{[^{}]*\}/g, '')
  // A line of plain words, an editor variable aside, is split. A shell would
  // read `${file}` as a variable of its own, so such a word is not quoted
  // into a shell line unless the line needs a shell anyway.
  if (!SHELL_SYNTAX.test(plain) && !ASSIGNMENT.test(line)) {
    const words = line.split(/\s+/).filter((w) => w !== '')
    return { argv: [...words, ...literal].map(expand), cwd, type }
  }
  const full = [substituteInShell(line, expand), ...literal.map((a) => shellQuote(expand(a)))]
  return { argv: ['sh', '-c', full.join(' ')], cwd, type, detail: full.join(' ') }
}

const KNOWN_AT = new RegExp(KNOWN.source, 'y')

/**
 * `line` with each known variable replaced by its value, quoted for where it
 * sits: a whole word outside quotes, escaped inside `"…"`, and spliced between
 * a closed and a reopened `'…'`. An escaped character (`\\$`) is left alone.
 */
function substituteInShell(line: string, expand: (s: string) => string): string {
  let out = ''
  let quote: '"' | "'" | null = null
  for (let i = 0; i < line.length;) {
    const c = line[i]!
    if (c === '$') {
      KNOWN_AT.lastIndex = i
      const m = KNOWN_AT.exec(line)
      if (m !== null) {
        const value = expand(m[0])
        out +=
          quote === '"'
            ? value.replace(/[\\$`"]/g, '\\$&')
            : quote === "'"
              ? `'${shellQuote(value)}'`
              : shellQuote(value)
        i += m[0].length
        continue
      }
    }
    if (c === '\\' && quote !== "'") {
      out += line.slice(i, i + 2)
      i += 2
      continue
    }
    if (c === "'" && quote !== '"') quote = quote === null ? "'" : null
    else if (c === '"' && quote !== "'") quote = quote === null ? '"' : null
    out += c
    i++
  }
  return out
}

/** `word` as one POSIX shell word. */
function shellQuote(word: string): string {
  return /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`
}

/** A `command` or an argument: a string, a list, or `{ value }`. */
function valueOf(value: unknown): string[] | undefined {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value
  if (isTable(value)) return valueOf(value['value'])
  return undefined
}

function labelOf(entry: unknown): string | undefined {
  if (!isTable(entry)) return undefined
  const label = entry['label'] ?? entry['taskName']
  return typeof label === 'string' && label !== '' ? label : undefined
}

/** The root-relative directory a task runs in, or `null` when it leaves the root. */
function cwdOf(
  ctx: RunnerContext,
  entry: Record<string, unknown>,
  folder: string,
  expand: (s: string) => string,
): string | null {
  const options = isTable(entry['options']) ? entry['options'] : {}
  if (typeof options['cwd'] !== 'string') return folder
  // Resolved by `node:path` rules, so a Windows root and a
  // `${workspaceFolder}/src` that mixes separators both work.
  const rel = relative(resolve(ctx.root), resolve(ctx.root, folder, expand(options['cwd'])))
  if (rel === '') return '.'
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null
  return rel.split(sep).join('/')
}

/** The argv that runs a package script, through the manager chosen for `dir`. */
function npmScript(ctx: RunnerContext, dir: string, script: string): string[] {
  const choice = ctx.packageManagers(dir).find((c) => c.ecosystem === 'node')
  const run = ctx.tools.find((t) => t.id === (choice?.tool ?? 'npm'))?.roles.packageManager?.run
  if (run === undefined)
    return dir === '.' ? ['npm', 'run', script] : ['npm', 'run', '--prefix', dir, script]
  if (dir === '.') return [...run.verb, script]
  if (run.dirFlagFirst !== true) return [...run.verb, run.dirFlag, dir, script]
  const [binary, ...rest] = run.verb
  return [binary!, run.dirFlag, dir, ...rest, script]
}
