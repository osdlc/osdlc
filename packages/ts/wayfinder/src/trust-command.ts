/**
 * `way trust`: cli-tool's shared `trust` command over wayfinder's marker store
 * (`trust-store.ts`) and the user file's `trust` policy. A root the policy
 * covers reports trusted with no marker, and every answer says which layer
 * decided (`by`, `rule`).
 *
 * `--scope <tool>` grants, removes or shows one tool's trust instead of the
 * whole repository's. Granting is `cli-only`: the MCP and HTTP adapters
 * refuse it.
 */

import { CommandError, type CommandContext, type DataCommand } from '@osdlc/cli-tool/command'
import type { FlagSpec } from '@osdlc/cli-tool/define-cli'
import {
  trustCommand as sharedTrustCommand,
  type TrustEntry,
  type TrustRequest,
  type TrustService,
} from '@osdlc/cli-tool/trust-command'
import {
  WHOLE_REPO_SCOPE,
  parseTrustScope,
  policyExecGate,
  type PolicyExecGate,
  type TrustPolicy,
} from '@osdlc/trust-repo'

import { APP, BIN, PROJECT_CONFIG_FILENAME } from './app.ts'
import { commandEnv, type CommandEnvOptions } from './config-command.ts'
import { ConfigError, loadConfig, trustPolicyFromConfig, trustPolicyOptions } from './config.ts'
import { appTrustStore } from './trust-store.ts'

/** The `scope` field of an entry: absent for the whole repository. */
function scopeField(scope: string | undefined): { scope?: string } {
  return scope === undefined || scope === WHOLE_REPO_SCOPE ? {} : { scope }
}

function entryOf(gate: PolicyExecGate, scope: string | undefined): TrustEntry {
  return {
    root: gate.root,
    trusted: gate.trusted,
    by: gate.trusted ? gate.by : null,
    ...(gate.trusted && gate.rule !== undefined ? { rule: gate.rule } : {}),
    ...scopeField(scope),
  }
}

/** wayfinder's {@link TrustService}. */
export function trustService(opts: CommandEnvOptions = {}): TrustService {
  const env = commandEnv(opts)
  const setup = async (ctx: CommandContext) => {
    const home = env.home(ctx)
    return { root: await env.root(ctx), home, store: appTrustStore({ env: ctx.env, home }) }
  }
  // Loaded only by the modes that decide about one root, so a broken config
  // file cannot break `--list`.
  const policyFor = async (ctx: CommandContext, root: string, home: string) => {
    try {
      return trustPolicyFromConfig((await loadConfig(root, ctx.env, home)).effective)
    } catch (err) {
      if (err instanceof ConfigError) throw new CommandError(err.message)
      throw err
    }
  }
  // Decided by the function that gates a real run, so the answer always
  // matches what controls execution. `configured: true` asks whether the
  // marker or policy would allow it.
  const decide = (
    store: ReturnType<typeof appTrustStore>,
    policy: TrustPolicy,
    root: string,
    home: string,
    scope: string | undefined,
  ) =>
    policyExecGate(
      store,
      policy,
      { root, configured: true, ...(scope !== undefined ? { scopes: [scope] } : {}) },
      trustPolicyOptions(home),
    )

  return {
    scopes: true,
    parseScope: parseTrustScope,

    async trust(ctx, req: TrustRequest) {
      const { root, home, store } = await setup(ctx)
      const policy = await policyFor(ctx, root, home)
      const result = await store.trust(root, req.scope)
      const gate = await decide(store, policy, root, home, req.scope)
      return { ...entryOf(gate, req.scope), root: result.root, changed: !result.alreadyTrusted }
    },

    async untrust(ctx, req: TrustRequest) {
      const { root, home, store } = await setup(ctx)
      const policy = await policyFor(ctx, root, home)
      // Resolved first, so the answer names the path the store is keyed on.
      const resolved = await store.resolveRoot(root)
      const removed = await store.untrust(resolved, req.scope)
      // The root may still be trusted by policy once its marker is gone.
      const gate = await decide(store, policy, root, home, req.scope)
      return { ...entryOf(gate, req.scope), root: resolved, changed: removed }
    },

    async show(ctx, req: TrustRequest) {
      const { root, home, store } = await setup(ctx)
      const policy = await policyFor(ctx, root, home)
      return entryOf(await decide(store, policy, root, home, req.scope), req.scope)
    },

    async list(ctx) {
      const grants = await appTrustStore({ env: ctx.env, home: env.home(ctx) }).listGrants()
      return grants.map((g) => ({
        root: g.root,
        trusted: true,
        by: 'marker',
        ...scopeField(g.scope),
      }))
    },

    async untrustAll(ctx) {
      const { root, store } = await setup(ctx)
      const resolved = await store.resolveRoot(root)
      const scopes = await store.untrustAll(resolved)
      return {
        root: resolved,
        removed: scopes.map((scope) => ({
          root: resolved,
          trusted: false,
          by: null,
          ...scopeField(scope),
        })),
      }
    },
  }
}

const DESCRIPTION = `Some runners can only be read by running them: reading moon's task graph evaluates the repository's toolchain configuration. Trust is that consent, kept per repository outside it, keyed on the resolved path, so you are asked once.

Trust is one of two conditions: execution must also be allowed. ${APP} allows it by default, so trust is enough unless a config file sets allowExec: false. A repository cannot trust itself: allowExec and trust in ${PROJECT_CONFIG_FILENAME} cannot raise the gate. Pass --exec to allow one run without recording anything.

A root can also be trusted with no marker, by trust.paths and trust.owners in the user config, and one tool by trust.tools.<tool>. --show names what decided: by marker, path or owner, with the rule that matched. --scope <tool> grants or removes one tool's trust; a run needs every tool it runs trusted, such as mise for a mise task.`

/**
 * The `trust` command. Mount it as `trust: trustCommand({ globals })`, with
 * the app's global flags; `-C` must be declared as `dir`.
 */
export function trustCommand<G extends FlagSpec = Record<never, never>>(
  options: CommandEnvOptions & { globals?: G } = {},
): DataCommand {
  const { globals, ...env } = options
  return sharedTrustCommand(trustService(env), {
    ...(globals !== undefined ? { globals } : {}),
    summary: `allow this repository's runners to be read by running them ("${BIN} trust")`,
    description: DESCRIPTION,
  })
}
