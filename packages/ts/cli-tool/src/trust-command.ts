/**
 * `trust`, the same in every tool: record, remove, show or list a person's
 * consent to run a repository's own code. The tool supplies a
 * {@link TrustService} over its store and policy (usually `@osdlc/trust-repo`).
 * This module parses the command line, picks the exit code and renders the
 * answer.
 */

import { z } from 'zod'

import {
  UsageError,
  commandKit,
  outcome,
  type CommandContext,
  type DataCommand,
} from './command/index.ts'
import { kebab } from './command/schema.ts'
import type { FlagSpec } from './define-cli.ts'
import { EXIT } from './exit.ts'
import { safe } from './safe.ts'

/**
 * One root's trust, and what decided it.
 * @experimental
 */
export interface TrustEntry {
  /** The resolved root the store is keyed on. */
  root: string
  trusted: boolean
  /** What decided: `marker`, a policy layer such as `path` or `owner`, or null when nothing trusts it. */
  by: string | null
  /** The policy rule that matched, for a policy decision. */
  rule?: string
  /** The scope of the grant, for a store with scopes. Absent for the whole repository. */
  scope?: string
}

/**
 * What `--scope` passes on, when the service supports scopes.
 * @experimental
 */
export interface TrustRequest {
  scope?: string
}

/**
 * What `trust` needs from a tool. Each method receives the command context,
 * so it can resolve the root from `ctx.cwd`, or from the tool's `-C` flag in
 * `ctx.globals`.
 * @experimental
 */
export interface TrustService {
  /** Record trust in the current root. `changed` is false when it was already trusted. */
  trust(ctx: CommandContext, req: TrustRequest): Promise<TrustEntry & { changed: boolean }>
  /** Remove the current root's marker. `changed` is false when there was none. */
  untrust(ctx: CommandContext, req: TrustRequest): Promise<TrustEntry & { changed: boolean }>
  /** The current root's trust, decided as a real run decides it. */
  show(ctx: CommandContext, req: TrustRequest): Promise<TrustEntry>
  /** Every recorded grant. */
  list(ctx: CommandContext, req: TrustRequest): Promise<TrustEntry[]>
  /**
   * Remove every grant of the current root, each scope's included, and
   * return the root and the grants removed. Supplying it adds
   * `--untrust-all`.
   */
  untrustAll?(ctx: CommandContext): Promise<{ root: string; removed: TrustEntry[] }>
  /** Whether `--scope` is offered. */
  scopes?: boolean
  /**
   * Read a typed `--scope` as the store reads it, and throw for one it
   * refuses. Its error becomes a usage error (exit 2). With
   * `@osdlc/trust-repo`, pass its `parseTrustScope`. Without it, a scope
   * must be 1-200 characters with no control characters and no space at
   * either end. `*`, the whole-repository grant, is refused either way.
   */
  parseScope?(scope: string): string
}

/** The longest scope name `--scope` takes. */
const MAX_SCOPE = 200

/**
 * The scope a typed `--scope` names: the service's `parseScope` answer, or
 * the default check. Either refusal is a usage error, and so is `*`, the
 * whole-repository grant that no `--scope` asks for.
 */
function readScope(service: TrustService, raw: string): string {
  let scope = raw
  if (service.parseScope !== undefined) {
    try {
      scope = service.parseScope(raw)
    } catch (err) {
      throw new UsageError(`--scope: ${err instanceof Error ? err.message : String(err)}`)
    }
  } else checkScope(raw)
  if (scope === '*') {
    throw new UsageError("--scope '*' is the whole repository; leave out --scope for that")
  }
  return scope
}

/**
 * Refuse a `--scope` that is empty, too long, or has a control character or
 * space at either end, as a usage error.
 */
function checkScope(scope: string): void {
  if (scope === '*') return
  const control = [...scope].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)
  if (scope === '' || scope.length > MAX_SCOPE || control || scope.trim() !== scope) {
    throw new UsageError(
      `--scope needs 1-${MAX_SCOPE} characters with no control characters and no space at either end`,
    )
  }
}

/** The mode flags, at most one per run. Granting trust is the run with none. */
const MODES = ['untrust', 'untrustAll', 'show', 'list'] as const

const EntrySchema = z.object({
  root: z.string(),
  trusted: z.boolean(),
  by: z.string().nullable(),
  rule: z.string().optional(),
  scope: z.string().optional(),
})

/**
 * The `trust` command's output.
 * @experimental
 */
export const TrustOutputSchema = z.object({
  /** The mode that ran. `untrust-all` is `--untrust-all`. */
  action: z.enum(['trust', 'untrust', 'untrust-all', 'show', 'list']),
  /** Whether this run changed the store. */
  changed: z.boolean(),
  roots: z.array(EntrySchema),
})

/**
 * The `trust` command over `service`.
 *
 * | Command line | Does | Exit 1 when |
 * |---|---|---|
 * | `trust` | record trust in this root | a config file will not parse |
 * | `trust --untrust` | remove this root's marker (with `--scope`, that scope's) | there was no marker |
 * | `trust --untrust-all` | remove every grant of this root, each scope's too | there was none |
 * | `trust --show` | report this root's trust | never: "not trusted" is an answer |
 * | `trust --list` | every recorded root | never |
 *
 * Two of the mode flags together are a usage error, and so is a `--scope`
 * that is empty, `*`, or has controls or space at either end. The JSON answer
 * has one shape for every mode: `{ action, changed, roots }`. `--untrust` on a
 * root with no marker still prints it, then exits 1. `--untrust-all` is there
 * when the service has `untrustAll`.
 *
 * Granting trust is `cli-only`: the MCP and HTTP adapters refuse it, so an
 * agent or a web page cannot grant itself trust. `--show`, `--list`,
 * `--untrust` and `--untrust-all` are open to them.
 * @experimental
 */
export function trustCommand<G extends FlagSpec = Record<never, never>>(
  service: TrustService,
  options: {
    globals?: G
    summary?: string
    description?: string
    /** The `--scope` flag's help, to name the scopes this tool has. */
    scopeHelp?: string
  } = {},
): DataCommand {
  const kit = commandKit({ globals: options.globals ?? ({} as G) })
  const scoped = service.scopes === true
  const flags: FlagSpec = {
    untrust: {
      kind: 'boolean',
      help: scoped
        ? "remove this repository's whole-repository grant, or with --scope that scope's; other scopes' grants stay"
        : "remove this repository's trust marker",
    },
    ...(service.untrustAll !== undefined
      ? {
          untrustAll: {
            kind: 'boolean',
            help: "remove every grant of this repository, each scope's included",
          },
        }
      : {}),
    show: { kind: 'boolean', help: "report this repository's trust and what decided it" },
    list: { kind: 'boolean', help: 'every trusted repository' },
    ...(scoped
      ? {
          scope: {
            kind: 'string',
            valueName: 'name',
            help: options.scopeHelp ?? 'the scope of the grant, such as one tool',
          },
        }
      : {}),
  }
  return kit.command({
    summary: options.summary ?? "remember that this repository's own code may run",
    ...(options.description !== undefined ? { description: options.description } : {}),
    flags,
    output: TrustOutputSchema,
    kind: 'trust',
    exposureOf: ({ flags: f }) => (MODES.some((m) => f[m] === true) ? 'all' : 'cli-only'),
    async run({ flags: f }, ctx) {
      const modes = MODES.filter((m) => f[m] === true)
      if (modes.length > 1) {
        throw new UsageError(
          `${modes.map((m) => `--${kebab(m)}`).join(' and ')} ask different things; give at most one`,
        )
      }
      let scope = f['scope']
      if (typeof scope === 'string') {
        scope = readScope(service, scope)
        if (modes[0] === 'untrustAll') {
          throw new UsageError('--untrust-all removes every scope; leave out --scope')
        }
      }
      const req: TrustRequest = typeof scope === 'string' ? { scope } : {}
      const strip = ({ changed: _c, ...entry }: TrustEntry & { changed: boolean }): TrustEntry =>
        entry
      switch (modes[0]) {
        case 'list':
          return { action: 'list' as const, changed: false, roots: await service.list(ctx, req) }
        case 'show':
          return { action: 'show' as const, changed: false, roots: [await service.show(ctx, req)] }
        case 'untrustAll': {
          const { root, removed } = await service.untrustAll!(ctx)
          const output = {
            action: 'untrust-all' as const,
            changed: removed.length > 0,
            roots: removed,
          }
          if (removed.length === 0) {
            ctx.note(`no grants to remove: ${root}`)
            return outcome(output, EXIT.error)
          }
          return output
        }
        case 'untrust': {
          const result = await service.untrust(ctx, req)
          const output = {
            action: 'untrust' as const,
            changed: result.changed,
            roots: [strip(result)],
          }
          if (!result.changed) {
            ctx.note(
              result.trusted
                ? `${result.root} has no marker to remove; it is trusted by ${result.by ?? 'policy'}${result.rule !== undefined ? ` ('${result.rule}')` : ''}, which --untrust does not change`
                : `not trusted: ${result.root}`,
            )
            return outcome(output, EXIT.error)
          }
          if (result.trusted) {
            ctx.note(
              `${result.root} is still trusted by ${result.by ?? 'policy'}${result.rule !== undefined ? ` ('${result.rule}')` : ''}; removing the marker changes nothing`,
            )
          }
          return output
        }
        default: {
          const result = await service.trust(ctx, req)
          return { action: 'trust' as const, changed: result.changed, roots: [strip(result)] }
        }
      }
    },
    // Roots and rules can come from a file in the repository, so controls are removed.
    text: (output) => safe(trustText(output)),
  }) as DataCommand
}

function trustText(output: z.infer<typeof TrustOutputSchema>): string {
  const [first] = output.roots
  switch (output.action) {
    case 'list':
      return output.roots
        .map((r) => `${r.root}${r.scope !== undefined ? ` (${r.scope})` : ''}\n`)
        .join('')
    case 'show':
      return `${first!.trusted ? 'trusted' : 'not trusted'} ${first!.root}${first!.by !== null && first!.trusted ? ` (by ${first!.by})` : ''}\n`
    case 'untrust':
    case 'untrust-all':
      return output.changed
        ? output.roots
            .map((r) => `untrusted ${r.root}${r.scope !== undefined ? ` (${r.scope})` : ''}\n`)
            .join('')
        : ''
    case 'trust':
      return `${output.changed ? 'trusted' : 'already trusted'} ${first!.root}\n`
  }
}
