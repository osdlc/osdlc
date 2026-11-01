/**
 * Where pull request evidence comes from. A provider answers two questions
 * for a repository: can its CLI be asked at all, and which pull (or merge)
 * requests exist. Classification reads {@link PRInfo} and never knows which
 * provider answered.
 */

import type { PRInfo } from '../types.ts'

/** The providers this build knows. */
export const PROVIDER_NAMES = ['github', 'gitlab'] as const

export type ProviderName = (typeof PROVIDER_NAMES)[number]

/** What a caller may ask for: one provider, none, or the one the remote's host suggests. */
export const PROVIDER_CHOICES = ['auto', ...PROVIDER_NAMES, 'none'] as const

export type ProviderChoice = (typeof PROVIDER_CHOICES)[number]

/** The forge a remote points at, read off its URL. */
export interface ForgeTarget {
  /** The host, lower-cased, without a port; null when the remote names none. */
  host: string | null
  /** The full project path, groups included (`group/sub/name`); null when there is none. */
  project: string | null
}

/** How a report names a provider's requests and the lookup that lists them. */
export interface ProviderWords {
  /** The CLI the provider runs: `gh`, `glab`. */
  tool: string
  /** What the forge calls one request: `PR`, `merge request`. */
  noun: string
  /** The command that lists them, as a report quotes it: `gh pr list`. */
  listing: string
}

/** The provider chosen for a repository, and what its probe found. */
export interface ProviderStatus extends ForgeTarget, ProviderWords {
  name: ProviderName
  /** The CLI is installed. */
  available: boolean
  /** The CLI has credentials for `host`. */
  authenticated: boolean
}

/** One source of pull request evidence. */
export interface PrProvider {
  readonly name: ProviderName
  readonly words: ProviderWords
  /** Whether the CLI is installed and signed in for `target`'s host. */
  probe(root: string, target: ForgeTarget): { available: boolean; authenticated: boolean }
  /**
   * The repository's pull requests, fork PRs already dropped, in any order;
   * null when the listing failed. A failure is not "no PRs": the caller
   * classifies on git evidence alone.
   *
   * @param branch Narrow the listing to this exact head branch. The caller
   *   checks the head again, so a provider that cannot narrow may list all.
   */
  listPrs(root: string, target: ForgeTarget, branch?: string): PRInfo[] | null
}
