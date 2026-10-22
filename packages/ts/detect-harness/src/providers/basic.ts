/**
 * The opencode, pi and Antigravity providers: install, folders and sign-in
 * evidence only. Their config, skills and MCP servers are not read yet.
 *
 * Sign-in sources:
 *   - opencode: `<data>/auth.json` exists (`$XDG_DATA_HOME/opencode`, else
 *     `~/.local/share/opencode`);
 *   - pi: the top-level key names of `<agent dir>/auth.json` are its configured
 *     providers (`$PI_CODING_AGENT_DIR`, else `~/.pi/agent`); values are never
 *     kept;
 *   - Antigravity keeps its login in the OS keyring, so there is no offline
 *     evidence and the answer is always `'unknown'`.
 */

import type { HarnessProvider, ProviderContext, ProviderResult } from '../contract.ts'
import type { BuiltinHarnessId } from '../harnesses.ts'
import { LOCATIONS } from '../locations.ts'
import type { Auth } from '../report.ts'
import { authEvidence, unknownAuth } from '../read/auth.ts'
import { configDirs, locate } from '../read/sources.ts'

function basic(id: BuiltinHarnessId, auth: (ctx: ProviderContext) => Auth): HarnessProvider {
  return {
    id,
    label: LOCATIONS[id].label,
    kind: 'parse',
    binary: LOCATIONS[id].binary,
    appBundles: LOCATIONS[id].appBundles,
    collect: (ctx): ProviderResult => ({ configDirs: configDirs(ctx, id), auth: auth(ctx) }),
  }
}

/** pi: configured providers are the key names of its auth file. */
function piAuth(ctx: ProviderContext): Auth {
  if (ctx.mode === 'project') return unknownAuth()
  const file = locate(ctx, 'pi', 'credentials')[0]?.resolved
  if (file === undefined) return unknownAuth()
  const read = ctx.readJson(file)
  // A missing or unreadable file stays `null`: "could not tell" is not "no providers".
  const providers = read.status === 'parsed' ? Object.keys(read.value) : null
  return providers !== null && providers.length > 0
    ? { signedIn: true, evidence: file, providers }
    : { ...unknownAuth(), providers }
}

export const opencodeProvider = basic('opencode', (ctx) =>
  authEvidence(ctx, { files: locate(ctx, 'opencode', 'credentials').map((l) => l.resolved) }),
)

export const piProvider = basic('pi', piAuth)

export const antigravityProvider = basic('antigravity', unknownAuth)
