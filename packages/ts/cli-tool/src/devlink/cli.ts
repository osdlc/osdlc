/**
 * `<tool> dev <verb>` for a tool with no CLI framework of its own. Parses the
 * verb and its few flags, calls the op, renders text or `--json`, and returns
 * an exit code. A tool with its own op registry mounts `ops.ts`
 * directly and never reaches this.
 */

import { dirname } from 'node:path'

import { EXIT } from '../exit.ts'
import type { CliIo } from '../io.ts'
import { DevlinkError, history, install, link, off, status, use, type OpOptions } from './ops.ts'
import { cwdDevVar, homeVar, type ToolSpec } from './spec.ts'

/**
 * The output interface the dev command writes through: the package's one
 * {@link CliIo}, re-exported here for the devlink entry. It is the stable
 * root interface, so it is not experimental here either.
 */
export type { CliIo }

/**
 * The output interface backed by the real process streams. Kept here rather
 * than taken from `../io.ts`, whose runtime imports the devlink entry avoids.
 * @experimental
 */
export const processIo: CliIo = {
  stdout: (t) => process.stdout.write(t),
  stderr: (t) => process.stderr.write(t),
}

/**
 * The help text of the tool's `dev` command.
 * @experimental
 */
export function usage(spec: ToolSpec): string {
  const n = spec.name
  return `${n} dev — run ${n} from a development checkout

usage: ${n} dev <verb> [options]

  install [PATH] [--bin-dir DIR]
                            put a shim for this checkout's launcher onto PATH
                            (default DIR: \${XDG_BIN_HOME:-$HOME/.local/bin})
  link [PATH] [--label L]   make a checkout the one every '${n}' runs
                            (default: the checkout above the cwd, else this one)
  use <#N|PATH|canonical>   switch to history entry N, a path, or back to
                            the canonical install
  off                       back to the canonical install
  status                    which checkout runs now, and why
  history                   every checkout ever linked, most recent first

  --json      machine output      --dry-run   report, write nothing

${order(spec)}
`
}

function order(spec: ToolSpec): string {
  return spec.cwdLayer === true
    ? `Resolution order, first hit wins: \$${homeVar(spec)}, a checkout above the
cwd (\$${cwdDevVar(spec)}=0 turns that off), the linked checkout, the local
install.`
    : `Resolution order, first hit wins: \$${homeVar(spec)}, the linked checkout, the
local install.`
}

/**
 * Options for running the `dev` command, including the output interface.
 * @experimental
 */
export interface RunOptions extends OpOptions {
  io?: CliIo
  /** Defaults to `process.platform`. On `win32` the command reports itself unavailable. */
  platform?: NodeJS.Platform
}

/**
 * Run `argv` (the words after `dev`). Returns the exit code.
 *
 * `opts.self` is the checkout the running code belongs to. `install` and a
 * bare `link` need it when the cwd is elsewhere.
 * @experimental
 */
export function runDevCli(spec: ToolSpec, argv: readonly string[], opts: RunOptions = {}): number {
  const io = opts.io ?? processIo
  // The launcher and the shims are POSIX shell scripts.
  if ((opts.platform ?? process.platform) === 'win32') {
    io.stderr(`${spec.name} dev: not available on Windows; the launcher is a POSIX shell script\n`)
    return EXIT.error
  }
  const args = [...argv]
  let json = false
  let dryRun = opts.dryRun ?? false
  let binDir: string | undefined
  let label: string | undefined
  const positional: string[] = []
  let badValue: string | null = null
  // `--flag value`: the value must exist, be non-empty and not look like another flag.
  const valueOf = (
    flag: string,
    inline: string | undefined,
    i: number,
  ): [string | undefined, number] => {
    const v = inline ?? args[i + 1]
    const used = inline === undefined ? i + 1 : i
    if (v === undefined || v === '' || (inline === undefined && v.startsWith('-'))) {
      badValue ??= flag
      return [undefined, i]
    }
    return [v, used]
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (a === '--json') json = true
    else if (a === '--dry-run') dryRun = true
    else if (a === '--bin-dir' || a.startsWith('--bin-dir=')) {
      ;[binDir, i] = valueOf('--bin-dir', a === '--bin-dir' ? undefined : a.slice(10), i)
    } else if (a === '--label' || a.startsWith('--label=')) {
      ;[label, i] = valueOf('--label', a === '--label' ? undefined : a.slice(8), i)
    } else if (a === '--help' || a === '-h') {
      io.stdout(usage(spec))
      return EXIT.ok
    } else if (a.startsWith('-')) {
      io.stderr(`${spec.name} dev: unknown option ${a}\n`)
      return EXIT.usage
    } else positional.push(a)
  }
  if (badValue !== null) {
    io.stderr(`${spec.name} dev: ${badValue} needs a non-empty value\n`)
    return EXIT.usage
  }
  const verb = positional.shift()
  const o: OpOptions = { ...opts, dryRun }
  const emit = (value: unknown, text: () => string): void => {
    io.stdout(json ? `${JSON.stringify(value, null, 2)}\n` : text())
  }
  const suffix = dryRun ? ' (dry-run, nothing written)' : ''

  try {
    switch (verb) {
      case undefined:
      case 'help': {
        io.stdout(usage(spec))
        return verb === undefined ? EXIT.usage : EXIT.ok
      }
      case 'install': {
        const checkout = positional[0] ?? opts.self ?? null
        if (checkout === null) {
          io.stderr(`${spec.name} dev install: no checkout to install from — pass a path\n`)
          return EXIT.usage
        }
        const out = install(spec, { checkout, binDir }, o)
        emit(out, () => {
          const rows = out.links.map((l) => `${l.linkPath} → ${out.target} (${l.status})`)
          const warn = out.onPath
            ? ''
            : `warning: ${out.binDir} is not on your PATH — add it so '${spec.name}' resolves here.\n`
          return `${rows.join('\n')}${suffix}\n${warn}`
        })
        return EXIT.ok
      }
      case 'link': {
        const out = link(spec, { checkout: positional[0], label }, o)
        emit(out, () => renderLinked(spec, out.checkout, out.entry, out.branch, out.head, suffix))
        return EXIT.ok
      }
      case 'use': {
        const target = positional[0]
        if (target === undefined) {
          io.stderr(`${spec.name} dev use: expected #N, a path, or 'canonical'\n`)
          return EXIT.usage
        }
        const out = use(spec, { target, label }, o)
        emit(out, () =>
          out.kind === 'canonical'
            ? renderOff(spec, out.previous, suffix)
            : renderLinked(spec, out.checkout, out.entry, out.branch, out.head, suffix),
        )
        return EXIT.ok
      }
      case 'off': {
        const out = off(spec, o)
        emit(out, () => renderOff(spec, out.previous, suffix))
        return EXIT.ok
      }
      case 'status': {
        const out = status(spec, o)
        emit(out, () => renderStatus(spec, out))
        return EXIT.ok
      }
      case 'history': {
        const out = history(spec, o)
        emit(out, () => renderHistory(out))
        return EXIT.ok
      }
      default: {
        io.stderr(`${spec.name} dev: unknown verb '${verb}'\n\n${usage(spec)}`)
        return EXIT.usage
      }
    }
  } catch (e) {
    if (e instanceof DevlinkError) {
      io.stderr(`${spec.name} dev: ${e.message}\n`)
      return EXIT.error
    }
    throw e
  }
}

function renderLinked(
  spec: ToolSpec,
  checkout: string,
  entry: string,
  branch: string | null,
  head: string | null,
  suffix: string,
): string {
  const at =
    branch !== null || head !== null ? ` [${[branch, head].filter(Boolean).join(' @ ')}]` : ''
  return (
    `${spec.name} now runs ${entry}${suffix}\n` +
    `  checkout: ${checkout}${at}\n` +
    `  '${spec.name} dev off' returns to the local install; '${spec.name} dev history' lists every link.\n`
  )
}

function renderOff(spec: ToolSpec, previous: string | null, suffix: string): string {
  return previous === null
    ? `no checkout was linked; ${spec.name} already runs the local install.${suffix}\n`
    : `unlinked ${previous}${suffix}\n${spec.name} runs the local install.\n`
}

function renderStatus(spec: ToolSpec, s: ReturnType<typeof status>): string {
  const sel = s.selection
  const active =
    sel.source === 'local'
      ? `local (${sel.reason})`
      : `${sel.source} → ${sel.entry} (${sel.reason})`
  const cwdLine =
    s.cwd.checkout === null
      ? '(not inside a checkout)'
      : `${s.cwd.checkout}${s.cwd.suppressed ? ' (suppressed)' : ''}`
  const linkLine =
    s.link.value === null
      ? '(unset)'
      : `${s.link.value}${s.link.valid ? '' : ' (invalid — no longer a checkout)'}${s.link.suppressed ? ' (suppressed)' : ''}`
  const names = s.path.names.map((n) => `${n.name}: ${n.found ?? '(not on PATH)'}`).join(', ')
  return (
    `active: ${active}\n` +
    `  ${s.env.var}: ${s.env.value ?? '(unset)'}\n` +
    // A spec without the cwd layer never looks there, so the line is left out.
    (spec.cwdLayer === true ? `  cwd:      ${cwdLine}\n` : '') +
    `  link:     ${s.link.path} = ${linkLine}\n` +
    `  self:     ${s.self ?? '(not inside a checkout)'}\n` +
    `  history:  ${s.history.entries} checkout(s) in ${s.history.path}\n` +
    `  PATH:     ${names}\n` +
    (s.link.legacy !== null
      ? `note: an old link file is at ${s.link.legacy}; this release reads ${s.link.path}.\n` +
        `  move it: mkdir -p ${sq(dirname(s.link.path))} && mv ${sq(s.link.legacy)} ${sq(s.link.path)}\n`
      : '')
  )
}

/** `text` as one single-quoted POSIX shell word. */
function sq(text: string): string {
  return `'${text.replaceAll("'", "'\\''")}'`
}

function renderHistory(rows: ReturnType<typeof history>): string {
  if (rows.length === 0) return 'no checkouts have been linked yet.\n'
  return (
    rows
      .map((r) => {
        const mark = r.active ? '*' : ' '
        const at = [r.branch, r.head].filter(Boolean).join(' @ ')
        const flags = [r.valid ? '' : 'missing', r.label ?? ''].filter(Boolean).join(', ')
        return `${mark} #${r.index}  ${r.checkout}${at ? `  [${at}]` : ''}  ${r.lastEvent} ${r.lastAt}${flags ? `  (${flags})` : ''}`
      })
      .join('\n') +
    "\n\n* = active. 'dev use #N' switches; 'dev use canonical' returns to the local install.\n"
  )
}
