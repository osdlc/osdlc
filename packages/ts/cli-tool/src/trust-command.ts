/**
 * `trust`, the same in every tool: record, remove, show or list a person's
 * consent to run a repository's own code. The tool supplies a
 * {@link TrustService} over its store and policy (usually `@osdlc/trust-repo`).
 * This module parses the command line, picks the exit code and renders the
 * answer.
 *
 * The repository is the working directory (or the tool's `-C`) by default. A
 * service with `parseRepo` also takes one named as `host/owner/name`, for a
 * clone whose folder the tool may prune and make again:
 * `tooly trust github.com/acme/api`.
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
  /** The resolved root the store is keyed on, or the repository's `host/owner/name`. */
  root: string
  /** `repo` when {@link root} is a repository's `host/owner/name`; absent or `path` for a root. */
  kind?: 'path' | 'repo'
  trusted: boolean
  /** What decided: `marker`, a policy layer such as `path` or `owner`, or null when nothing trusts it. */
  by: string | null
  /** The policy rule that matched, for a policy decision. */
  rule?: string
  /** The scope of the grant, for a store with scopes. Absent for the whole repository. */
  scope?: string
}

/**
 * What the command line passes on: `--scope`, when the service supports
 * scopes, and the repository named, when it supports repositories.
 * @experimental
 */
export interface TrustRequest {
  scope?: string
  /**
   * The repository named on the command line, as {@link TrustService.parseRepo}
   * returned it. When set, the method acts on it and not on the working
   * directory. Set only for a service with `parseRepo`.
   */
  repo?: string
}

/**
 * What `trust` needs from a tool. Each method receives the command context,
 * so it can resolve the root from `ctx.cwd`, or from the tool's `-C` flag in
 * `ctx.globals`. When `req.repo` is set, the method acts on that repository
 * instead.
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
   * Remove every grant of the current root, or of `req.repo`, each scope's
   * included, and return the root and the grants removed. Supplying it adds
   * `--untrust-all`.
   */
  untrustAll?(
    ctx: CommandContext,
    req: TrustRequest,
  ): Promise<{ root: string; removed: TrustEntry[] }>
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
  /**
   * Read a repository named on the command line, such as
   * `github.com/acme/api`, as the store reads it, and throw for one it
   * refuses. Its error becomes a usage error (exit 2). With
   * `@osdlc/trust-repo`, pass its `parseTrustRepo`.
   *
   * Supplying it adds the optional `repository` argument, and every method
   * must then act on `req.repo` when it is set. Without it the command takes
   * no argument, so a tool whose service would ignore `req.repo` never
   * grants the working directory in its place.
   */
  parseRepo?(repo: string): string
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

/** The repository a typed argument names: the service's `parseRepo` answer, or a usage error. */
function readRepo(parse: (repo: string) => string, raw: string): string {
  try {
    return parse(raw)
  } catch (err) {
    throw new UsageError(`repository: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** The mode flags, at most one per run. Granting trust is the run with none. */
const MODES = ['untrust', 'untrustAll', 'show', 'list'] as const

const EntrySchema = z.object({
  root: z.string(),
  kind: z.enum(['path', 'repo']).optional(),
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
 * With a service that has `parseRepo`, each mode but `--list` also takes a
 * repository, `trust github.com/acme/api`, in place of the current root.
 *
 * Two of the mode flags together are a usage error, and so is a `--scope`
 * that is empty, `*`, or has controls or space at either end, a repository
 * the service refuses, and a repository with `--list`. The JSON answer
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
  const parseRepo = service.parseRepo?.bind(service)
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
    ...(parseRepo !== undefined
      ? {
          positionals: [
            {
              name: 'repository',
              help: 'a repository as host/owner/name, such as github.com/acme/api, in place of this one',
            },
          ],
        }
      : {}),
    output: TrustOutputSchema,
    kind: 'trust',
    exposureOf: ({ flags: f }) => (MODES.some((m) => f[m] === true) ? 'all' : 'cli-only'),
    async run({ flags: f, positionals }, ctx) {
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
      const [word] = positionals
      let repo: string | undefined
      if (word !== undefined && parseRepo !== undefined) {
        if (modes[0] === 'list') {
          throw new UsageError('--list lists every grant; leave out the repository')
        }
        repo = readRepo(parseRepo, word)
      }
      const req: TrustRequest = {
        ...(typeof scope === 'string' ? { scope } : {}),
        ...(repo !== undefined ? { repo } : {}),
      }
      const strip = ({ changed: _c, ...entry }: TrustEntry & { changed: boolean }): TrustEntry =>
        entry
      switch (modes[0]) {
        case 'list':
          return { action: 'list' as const, changed: false, roots: await service.list(ctx, req) }
        case 'show':
          return { action: 'show' as const, changed: false, roots: [await service.show(ctx, req)] }
        case 'untrustAll': {
          const { root, removed } = await service.untrustAll!(ctx, req)
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
