/**
 * The command line for querying a vault with Obsidian Bases syntax. `src/bin.ts` runs `main`.
 *
 *   markdown-vault-query query <file.base> [--vault <dir>] [--view <name>] [--this <vault-path>] [--json]
 *   markdown-vault-query filter '<expression>' [--vault <dir>] [--this <vault-path>] [--json]
 *   markdown-vault-query check <file.base> [...]
 *   markdown-vault-query views <file.base>
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { scanVault } from '@osdlc/markdown-vault'
import { parseBase, BaseParseError } from './base/parse.ts'
import { runView, queryExpression, selectView, type ViewRow } from './query.ts'
import { toDisplayString, ErrorValue, type Value } from './expr/values.ts'
import { vaultRelativePath } from './vault-relative.ts'
import { renderTable } from './render-table.ts'

interface Flags {
  vault: string
  view: string | undefined
  json: boolean
  thisPath: string | undefined
  help: boolean
  positional: string[]
}

/** Flags that take the next argument as their value. */
const VALUE_FLAGS = new Set(['--vault', '--view', '--this'])

/**
 * Read the arguments after the command. Throws an `Error` naming the first unknown flag or the
 * first value flag with no value. `--help` wins over everything else on the line, including such
 * a problem. An argument after `--` is positional.
 */
function parseArgs(argv: readonly string[]): Flags {
  const flags: Flags = {
    vault: process.cwd(),
    view: undefined,
    json: false,
    thisPath: undefined,
    help: false,
    positional: [],
  }
  let problem: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    // In range by the loop bound.
    if (arg === undefined) continue
    if (arg === '--') {
      flags.positional.push(...argv.slice(i + 1))
      break
    }
    if (VALUE_FLAGS.has(arg)) {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) {
        problem ??= `${arg} needs a value`
        continue
      }
      i++
      if (arg === '--vault') flags.vault = resolve(value)
      else if (arg === '--view') flags.view = value
      else flags.thisPath = value
      continue
    }
    switch (arg) {
      case '--json':
        flags.json = true
        break
      case '--help':
      case '-h':
        flags.help = true
        return flags
      default:
        if (arg.startsWith('-') && arg !== '-') {
          problem ??= `Unknown option ${arg}. Put an argument that starts with "-" after "--".`
        } else flags.positional.push(arg)
    }
  }
  if (problem !== undefined) throw new Error(problem)
  return flags
}

/**
 * Print the usage text and return `code`, the exit code to end with. The text goes to stdout for
 * exit code 0 and to stderr otherwise.
 */
function usage(code: number): number {
  const print = code === 0 ? console.log : console.error
  print(`Usage:
  markdown-vault-query query <file.base> [--vault <dir>] [--view <name>] [--this <vault-path>] [--json]
  markdown-vault-query filter '<expression>' [--vault <dir>] [--this <vault-path>] [--json]
  markdown-vault-query check <file.base> [...]
  markdown-vault-query views <file.base>

Options:
  --vault <dir>   Vault root to scan (default: current directory)
  --view <name>   View to run (default: first view in the base)
  --this <path>   Vault-relative path used for \`this\` in expressions
  --json          Emit JSON instead of a table`)
  return code
}

function cell(value: Value): string {
  if (value instanceof ErrorValue) return `⚠ ${value.message}`
  return toDisplayString(value)
}

function jsonValue(value: Value): unknown {
  if (value instanceof ErrorValue) return { error: value.message }
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(jsonValue)
  return toDisplayString(value)
}

/** Run one command and return its exit code: 0 on success, 1 on any failure. */
async function run(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv
  if (!command || command === '--help' || command === '-h') return usage(command ? 0 : 1)
  const flags = parseArgs(rest)
  if (flags.help) return usage(0)

  if (command === 'check') {
    if (flags.positional.length === 0) return usage(1)
    let failed = false
    for (const path of flags.positional) {
      try {
        const base = parseBase(await readFile(path, 'utf8'))
        console.log(`ok   ${path} (${base.views.length} view${base.views.length === 1 ? '' : 's'})`)
      } catch (e) {
        failed = true
        console.error(`FAIL ${path}: ${(e as Error).message}`)
      }
    }
    return failed ? 1 : 0
  }

  if (command === 'views') {
    const [basePath] = flags.positional
    if (!basePath) return usage(1)
    let base
    try {
      base = parseBase(await readFile(basePath, 'utf8'))
    } catch (e) {
      if (e instanceof BaseParseError) {
        console.error(`Invalid base file: ${e.message}`)
        return 1
      }
      throw e
    }
    for (const view of base.views) {
      console.log(`${view.type}\t${view.name}`)
    }
    return 0
  }

  if (command === 'filter') {
    const [expression] = flags.positional
    if (!expression) return usage(1)
    const vault = await scanVault(flags.vault)
    // Spread rather than assigned: `thisPath` is optional and read as a
    // truthy test, so omitting it is the same answer as undefined.
    const notes = queryExpression(vault, expression, {
      ...(flags.thisPath !== undefined ? { thisPath: flags.thisPath } : {}),
    })
    if (flags.json) {
      console.log(
        JSON.stringify(
          notes.map((n) => n.file.path),
          null,
          2,
        ),
      )
    } else {
      for (const note of notes) console.log(note.file.path)
      console.error(`\n${notes.length} of ${vault.notes.length} files matched`)
    }
    return 0
  }

  if (command === 'query') {
    const [basePath] = flags.positional
    if (!basePath) return usage(1)
    const source = await readFile(basePath, 'utf8')
    let base
    try {
      base = parseBase(source)
    } catch (e) {
      if (e instanceof BaseParseError) {
        console.error(`Invalid base file: ${e.message}`)
        return 1
      }
      throw e
    }

    const vault = await scanVault(flags.vault)
    // `this` defaults to the base file itself when it lives inside the vault.
    const thisPath = flags.thisPath ?? vaultRelativePath(flags.vault, basePath)

    const view = selectView(base, flags.view)
    const result = runView(vault, base, view.name, {
      ...(thisPath !== undefined ? { thisPath } : {}),
    })

    // A view without `order` shows the file name. runView evaluates only the
    // ids in `order`, so that fallback column is read off the note itself.
    const fallback = view.order.length === 0
    const columns = fallback ? ['file.name'] : view.order
    const valueOf = (row: ViewRow, c: string): Value =>
      fallback ? row.note.file.name : (row.columns[c] ?? null)
    if (flags.json) {
      console.log(
        JSON.stringify(
          {
            view: view.name,
            total: result.total,
            rows: result.rows.map((row) => ({
              path: row.note.file.path,
              columns: Object.fromEntries(columns.map((c) => [c, jsonValue(valueOf(row, c))])),
            })),
            ...(result.groups
              ? {
                  groups: result.groups.map((g) => ({
                    key: jsonValue(g.key),
                    count: g.rows.length,
                  })),
                }
              : {}),
            ...(Object.keys(result.summaries).length > 0
              ? {
                  summaries: Object.fromEntries(
                    Object.entries(result.summaries).map(([k, v]) => [k, jsonValue(v)]),
                  ),
                }
              : {}),
          },
          null,
          2,
        ),
      )
      return 0
    }

    if (result.groups) {
      for (const group of result.groups) {
        console.log(`\n== ${group.keyDisplay || '(empty)'} (${group.rows.length}) ==`)
        console.log(
          renderTable(
            columns,
            group.rows.map((row) => columns.map((c) => cell(valueOf(row, c)))),
          ),
        )
      }
    } else {
      console.log(
        renderTable(
          columns,
          result.rows.map((row) => columns.map((c) => cell(valueOf(row, c)))),
        ),
      )
    }
    if (Object.keys(result.summaries).length > 0) {
      console.log('\nSummaries:')
      for (const [prop, value] of Object.entries(result.summaries)) {
        console.log(`  ${prop}: ${cell(value)}`)
      }
    }
    console.error(
      `\n${result.rows.length} row${result.rows.length === 1 ? '' : 's'} (of ${result.total} matched, vault: ${vault.notes.length} files)`,
    )
    return 0
  }

  return usage(1)
}

/**
 * {@link run}, printing an error it throws as the bare message, with exit 1. Returns the exit
 * code and never exits.
 */
export async function main(argv: readonly string[]): Promise<number> {
  try {
    return await run(argv)
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    return 1
  }
}
