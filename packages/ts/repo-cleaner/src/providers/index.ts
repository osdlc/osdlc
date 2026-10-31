/**
 * Choosing a provider for a repository, from the caller's choice and the
 * remote's host.
 */

import { resolveRunner, type CommandRunner } from '@osdlc/command-seam'
import type { Gh } from '@osdlc/typed-gh'

import { githubProvider } from './github.ts'
import { gitlabProvider } from './gitlab.ts'
import type {
  ForgeTarget,
  PrProvider,
  ProviderChoice,
  ProviderName,
  ProviderStatus,
} from './types.ts'

export { githubProvider } from './github.ts'
export { gitlabProvider } from './gitlab.ts'
export * from './types.ts'

/** Every known provider, over the given clients. `glab` defaults to the real binary. */
export function providers(clients: {
  gh: Gh
  glab?: CommandRunner | undefined
}): Record<ProviderName, PrProvider> {
  return {
    github: githubProvider(clients.gh),
    gitlab: gitlabProvider(resolveRunner('glab', clients.glab)),
  }
}

const NO_TARGET: ForgeTarget = { host: null, project: null }

/**
 * The host and full project path a remote URL names, groups kept
 * (`gitlab.com:group/sub/name.git` is project `group/sub/name`). A local path
 * or a `file:` URL names no forge.
 */
export function forgeTarget(url: string | null): ForgeTarget {
  if (url === null) return NO_TARGET
  const trimmed = url.trim()
  if (/^file:/i.test(trimmed)) return NO_TARGET
  // scp form, user optional (`host:path` is valid git). A one-letter host is a
  // Windows drive (`C:/repo`), which git reads as a local path.
  const scp = /^(?:[\w.-]+@)?([^:/\\]{2,}):(?!\/\/)(.+)$/.exec(trimmed)
  const uri = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i.exec(trimmed)
  const match = uri ?? scp
  if (match === null) return NO_TARGET
  const path = match[2]!.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')
  const parts = path.split('/').filter((p) => p !== '')
  if (parts.length < 2) return { host: match[1]!.toLowerCase(), project: null }
  return { host: match[1]!.toLowerCase(), project: parts.join('/') }
}

/**
 * The provider `choice` names for `target`. `auto` reads the host: one with
 * `gitlab` in its name is GitLab, any other is GitHub, which is what the sweep
 * did before providers existed (`gh` answers nothing for a host it does not
 * know). `none` is no provider.
 */
export function chooseProvider(choice: ProviderChoice, target: ForgeTarget): ProviderName | null {
  if (choice === 'none') return null
  if (choice !== 'auto') return choice
  return target.host !== null && target.host.includes('gitlab') ? 'gitlab' : 'github'
}

/** The chosen provider for a repository, probed; null for none. */
export function probeProvider(
  choice: ProviderChoice,
  root: string,
  target: ForgeTarget,
  all: Record<ProviderName, PrProvider>,
): ProviderStatus | null {
  const name = chooseProvider(choice, target)
  if (name === null) return null
  const provider = all[name]
  return { name, tool: provider.tool, ...target, ...provider.probe(root, target) }
}
