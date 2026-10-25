/**
 * What every `way` command shares: the global flags, the command kit typed
 * with them, and the step that turns the parsed flags into a session.
 */

import { commandKit, CommandError, UsageError, type CommandContext } from '@osdlc/cli-tool/command'
import type { FlagValues } from '@osdlc/cli-tool/define-cli'
import { closestMatches } from '@osdlc/config-layers/did-you-mean'
import { withheldHint } from '@osdlc/trust-repo'

import { BIN } from '../app.ts'
import type { TaskFilter } from '../core/filter.ts'
import { SessionError, createSession, type CatalogSnapshot, type Session } from '../core/session.ts'
import { unknownLine, type Unknown } from '../core/unknowns.ts'
import {
  NOT_CACHED,
  WITHHELD,
  countRunners,
  refreshCostLabel,
  runnerLabel,
  staleLabel,
} from '../vocabulary.ts'

/**
 * The flags every command takes, before or after the command word. They
 * choose the repository and what is collected from it.
 */
export const GLOBALS = {
  dir: {
    kind: 'string',
    short: 'C',
    valueName: 'PATH',
    help: 'the directory to inspect (default: cwd)',
  },
  exec: {
    kind: 'tristate',
    help: 'allow runners that must run a subprocess (moon), this run only',
    offHelp: 'skip them, overriding a configured allowExec: true',
  },
  only: { kind: 'list', valueName: 'a,b', hidden: true, help: 'restrict to these runners' },
  exclude: {
    kind: 'list',
    valueName: 'a,b',
    hidden: true,
    help: 'skip these runners, REPLACING the configured runners.disabled',
  },
  excludePath: {
    kind: 'list',
    valueName: 'P',
    commaSeparated: false,
    hidden: true,
    help: 'skip a path; repeatable. A bare name matches any segment, a value with a slash matches a path from the root',
  },
  discovery: {
    kind: 'enum',
    choices: ['git', 'walk', 'auto'] as const,
    valueName: 'M',
    hidden: true,
    help: 'how to find directories. Default: auto',
  },
  config: {
    kind: 'list',
    valueName: 'MODULE',
    commaSeparated: false,
    help: 'load extra tools from a module, this run only; repeatable',
  },
} as const

export const kit = commandKit({ globals: GLOBALS })

/** The parsed global flags, as a command receives them. */
export type Globals = FlagValues<typeof GLOBALS>

/** The filter flags `list` and `query` share, beside `--services`. */
export const FILTER_FLAGS = {
  cached: {
    kind: 'boolean',
    help: 'answer from the last stored probe, not a new one',
  },
  services: { kind: 'boolean', help: 'only tasks that run until you stop them' },
  declared: {
    kind: 'boolean',
    help: 'only tasks a file declares, not ones inferred from a convention',
  },
  depth: {
    kind: 'string',
    valueName: 'N',
    help: 'only tasks declared at most N directories below the root (the web view calls this Scope)',
  },
} as const

/** The filter the shared filter flags ask for. */
export function filterFrom(flags: {
  services: boolean
  declared: boolean
  depth?: string | undefined
}): TaskFilter {
  const filter: TaskFilter = {}
  if (flags.services) filter.servicesOnly = true
  if (flags.declared) filter.declaredOnly = true
  if (flags.depth !== undefined) {
    if (!/^\d+$/.test(flags.depth.trim())) {
      throw new CommandError('--depth needs a whole number', { exit: 2, code: 'usage' })
    }
    filter.maxDepth = Number.parseInt(flags.depth.trim(), 10)
  }
  return filter
}

/** The command words, for a "did you mean" when a directory does not exist. */
let commandWords: readonly string[] = []

/** Set by the app once the tree is built. */
export function setCommandWords(words: readonly string[]): void {
  commandWords = words
}

/**
 * Start the session the global flags describe. A positional directory beats
 * `-C`. A {@link SessionError} becomes a {@link CommandError} with the same
 * code, and the session's warnings go to stderr.
 */
export async function openSession(
  globals: Globals,
  ctx: CommandContext,
  home: string,
  positionalDir?: string,
): Promise<Session> {
  // Over HTTP every command keeps the directory `way serve` started with, so
  // a caller holding the token cannot read another directory's catalog.
  if (positionalDir !== undefined && ctx.surface === 'http') {
    throw new UsageError(
      'the directory is fixed when the web view starts; restart it to read another one',
    )
  }
  const dir = positionalDir ?? globals.dir ?? ctx.cwd
  let session: Session
  try {
    session = await createSession({
      dir,
      cwd: ctx.cwd,
      env: ctx.env,
      home,
      signal: ctx.signal,
      flags: {
        allowExec: globals.exec,
        ...(globals.only !== undefined ? { only: globals.only.filter(Boolean) } : {}),
        ...(globals.exclude !== undefined ? { exclude: globals.exclude.filter(Boolean) } : {}),
        ...(globals.excludePath !== undefined ? { excludePaths: globals.excludePath } : {}),
        ...(globals.discovery !== undefined ? { discovery: globals.discovery } : {}),
        toolModules: globals.config ?? [],
      },
    })
  } catch (err) {
    if (err instanceof SessionError) {
      let hint = err.hint
      if (err.code === 'no-such-directory' && positionalDir !== undefined) {
        const close = closestMatches(positionalDir, commandWords)
        if (close.length > 0) hint = `did you mean "${BIN} ${close[0]}"?`
      }
      throw new CommandError(err.message, {
        code: err.code,
        ...(hint !== undefined ? { hint } : {}),
      })
    }
    throw err
  }
  for (const warning of session.warnings) ctx.warn(warning)
  return session
}

/**
 * The `--cached` note, or null when there is nothing to say: which runners
 * were stale and which had nothing stored and were probed now.
 */
function cacheNote(snapshot: CatalogSnapshot): string | null {
  if (snapshot.origin === 'empty-store') {
    return '--cached: nothing cached for this repository yet; probed it now and stored the result'
  }
  if (snapshot.origin !== 'store') return null
  const stale = snapshot.cache.filter((r) => r.state === 'stale')
  const probed = snapshot.cache.filter((r) => r.probeMs !== undefined)
  if (stale.length === 0 && probed.length === 0) return null
  const parts: string[] = []
  if (stale.length > 0) {
    const each = stale.map(
      (r) =>
        `${runnerLabel(r.runner)} (${staleLabel(r.reason, r.ageMs)}; ${refreshCostLabel(r.estimateMs)})`,
    )
    parts.push(each.join(', '))
  }
  if (probed.length > 0) {
    parts.push(`${NOT_CACHED}, probed now: ${probed.map((r) => runnerLabel(r.runner)).join(', ')}`)
  }
  return `--cached: ${parts.join('; ')}`
}

/**
 * Write the notes a listing leaves on stderr: one line for the runners trust
 * would add, the `--cached` note, and a line for each other unknown. stdout
 * stays the listing, so it can be piped.
 */
export function noteUnknowns(
  ctx: CommandContext,
  session: Session,
  snapshot: CatalogSnapshot,
  unknowns: readonly Unknown[],
): void {
  const withheld = unknowns.filter((u) => u.kind === 'withheld')
  if (withheld.length > 0 && session.withheldReason() === 'untrusted') {
    ctx.note(`${countRunners(withheld.length)} ${WITHHELD} — ${withheldHint(BIN)}`)
  }
  const cache = cacheNote(snapshot)
  if (cache !== null) ctx.note(cache)
  for (const unknown of unknowns) {
    if (unknown.kind === 'parameters' || unknown.kind === 'binary') ctx.note(unknownLine(unknown))
  }
}
