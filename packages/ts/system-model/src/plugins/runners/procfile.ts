/**
 * Procfile: each `name: command` line of a `Procfile` or `Procfile.dev`.
 *
 * Every entry is a long-running process, so each task is a declared service
 * (`persistent: { value: true, declared: true }`).
 *
 * A Procfile is run by a process manager. The argv uses the first one on the
 * PATH, at collect time, in this order: overmind (`overmind start -l web`),
 * foreman (`foreman start web`), honcho (`honcho start web`). overmind and
 * foreman are given the file with `-f` unless it is the root `Procfile`, and
 * run its processes in its directory. honcho runs in the Procfile's
 * directory. With none on the PATH, the task runs the command line itself
 * (`sh -c <command>`) in the Procfile's directory. That skips what a manager adds, such as reading `.env`. The
 * manager is in the task's tags.
 *
 * A manager starts a process by name and takes no arguments for it, so
 * `invoke` throws when given any. The `sh -c` form takes them as `"$@"`.
 */

import type { ProviderContext } from '../../contract.ts'
import type { Diagnostic, ProviderResult, RunnerBrand, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import { dirOf, taskId } from '../support/shared.ts'

export const PROCFILE_NAMES = ['Procfile', 'Procfile.dev']

const CHAIN = [
  { label: 'runner', hint: 'A process manager runs the processes a Procfile declares.' },
  { label: 'file', hint: 'The Procfile, root-relative.' },
  { label: 'process', hint: 'The name before the colon.' },
]

/** A plain glyph: stacked processes. A Procfile has no mark of its own. */
export const PROCFILE_BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/></svg>',
  color: '#79589f',
}

/** The process managers tried, in order. */
export const PROCESS_MANAGERS = ['overmind', 'foreman', 'honcho'] as const

type Manager = (typeof PROCESS_MANAGERS)[number]

const LINE = /^([A-Za-z0-9_-]+):[ \t]*(.*\S)\s*$/

/** The entries of a Procfile, and the lines that are not one. */
export function readProcfile(text: string): {
  entries: Array<{ name: string; command: string }>
  bad: number[]
  duplicates: string[]
} {
  const entries: Array<{ name: string; command: string }> = []
  const bad: number[] = []
  const duplicates: string[] = []
  text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (line.trim() === '' || line.trimStart().startsWith('#')) return
      const m = LINE.exec(line)
      if (m === null) {
        bad.push(i + 1)
        return
      }
      if (entries.some((e) => e.name === m[1])) duplicates.push(m[1]!)
      else entries.push({ name: m[1]!, command: m[2]! })
    })
  return { entries, bad, duplicates }
}

/** The argv and directory that start process `name` of `file` through `manager`. */
function managerRun(manager: Manager, file: string, name: string): { argv: string[]; cwd: string } {
  const dir = dirOf(file)
  const base = file.slice(file.lastIndexOf('/') + 1)
  const f = base === 'Procfile' && dir === '.' ? [] : ['-f', file]
  switch (manager) {
    // Both run the processes in the Procfile's directory by default.
    case 'overmind':
      return { argv: ['overmind', 'start', ...f, '-l', name], cwd: '.' }
    case 'foreman':
      return { argv: ['foreman', 'start', name, ...f], cwd: '.' }
    // honcho reads `-f` relative to its `-d`, and runs processes where it runs.
    case 'honcho':
      return {
        argv: ['honcho', ...(base === 'Procfile' ? [] : ['-f', base]), 'start', name],
        cwd: dir,
      }
  }
}

export const procfileRunner: RunnerRole = {
  kind: 'parse',
  chain: CHAIN,

  async collect(ctx: ProviderContext): Promise<ProviderResult> {
    const tasks: Task[] = []
    const diagnostics: Diagnostic[] = []
    const found = await Promise.all(PROCFILE_NAMES.map((name) => ctx.files(name)))
    const manager = PROCESS_MANAGERS.find((m) => ctx.which(m) !== null)

    for (const file of found.flat().sort()) {
      const text = await ctx.readText(file)
      if (text === null) continue
      const { entries, bad, duplicates } = readProcfile(text)
      if (bad.length > 0) {
        diagnostics.push({
          severity: 'warning',
          message: `line ${bad.join(', ')} is not a \`name: command\` entry, so it was skipped`,
          source: file,
        })
      }
      if (duplicates.length > 0) {
        diagnostics.push({
          severity: 'warning',
          message: `process ${duplicates.join(', ')} is declared more than once; the first was kept`,
          source: file,
        })
      }
      const dir = dirOf(file)
      for (const { name, command } of entries) {
        const { argv, cwd } =
          manager === undefined
            ? { argv: ['sh', '-c', command], cwd: dir }
            : managerRun(manager, file, name)
        tasks.push({
          id: taskId('procfile', file, name),
          runner: 'procfile',
          path: ['procfile', file, name],
          argv,
          cwd,
          display: argv.join(' '),
          parameters: [],
          source: file,
          origin: 'declared',
          detail: command,
          tags: ['procfile', dir, manager ?? 'sh'],
          persistent: { value: true, declared: true },
          executes: 'local',
        })
      }
    }
    return { status: tasks.length > 0 ? 'ok' : 'absent', tasks, diagnostics }
  },

  invoke(task, args) {
    const [binary, flag, line, ...rest] = task.argv
    if (binary === 'sh' && flag === '-c' && line !== undefined && rest.length === 0) {
      return ['sh', '-c', `${line} "$@"`, 'sh', ...args]
    }
    throw new Error(`${task.argv[0]} starts a Procfile process by name and takes no arguments`)
  },
}
