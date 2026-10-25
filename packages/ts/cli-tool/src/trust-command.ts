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
  /** Whether `--scope` is offered. */
  scopes?: boolean
}

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
  action: z.enum(['trust', 'untrust', 'show', 'list']),
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
 * | `trust --untrust` | remove this root's marker | there was no marker |
 * | `trust --show` | report this root's trust | never: "not trusted" is an answer |
 * | `trust --list` | every recorded root | never |
 *
 * Two of the mode flags together are a usage error. The JSON answer has one
 * shape for every mode: `{ action, changed, roots }`. `--untrust` on a root
 * with no marker still prints it, then exits 1.
 *
 * Granting trust is `cli-only`: the MCP and HTTP adapters refuse it, so an
 * agent or a web page cannot grant itself trust. `--show`, `--list` and
 * `--untrust` are open to them.
 * @experimental
 */
export function trustCommand<G extends FlagSpec = Record<never, never>>(
  service: TrustService,
  options: { globals?: G; summary?: string; description?: string } = {},
): DataCommand {
  const kit = commandKit({ globals: options.globals ?? ({} as G) })
  const flags: FlagSpec = {
    untrust: { kind: 'boolean', help: "remove this repository's trust" },
    show: { kind: 'boolean', help: "report this repository's trust and what decided it" },
    list: { kind: 'boolean', help: 'every trusted repository' },
    ...(service.scopes === true
      ? {
          scope: {
            kind: 'string',
            valueName: 'name',
            help: 'the scope of the grant, such as one tool',
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
    exposureOf: ({ flags: f }) =>
      f['untrust'] === true || f['show'] === true || f['list'] === true ? 'all' : 'cli-only',
    async run({ flags: f }, ctx) {
      const modes = (['untrust', 'show', 'list'] as const).filter((m) => f[m] === true)
      if (modes.length > 1) {
        throw new UsageError(
          `${modes.map((m) => `--${m}`).join(' and ')} ask different things; give at most one`,
        )
      }
      const req: TrustRequest = typeof f['scope'] === 'string' ? { scope: f['scope'] } : {}
      const strip = ({ changed: _c, ...entry }: TrustEntry & { changed: boolean }): TrustEntry =>
        entry
      switch (modes[0]) {
        case 'list':
          return { action: 'list' as const, changed: false, roots: await service.list(ctx, req) }
        case 'show':
          return { action: 'show' as const, changed: false, roots: [await service.show(ctx, req)] }
        case 'untrust': {
          const result = await service.untrust(ctx, req)
          const output = {
            action: 'untrust' as const,
            changed: result.changed,
            roots: [strip(result)],
          }
          if (!result.changed) {
            ctx.note(`not trusted: ${result.root}`)
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
      return output.changed ? `untrusted ${first!.root}\n` : ''
    case 'trust':
      return `${output.changed ? 'trusted' : 'already trusted'} ${first!.root}\n`
  }
}
