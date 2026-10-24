/**
 * `hosted-git-info` ships no types of its own, and the DefinitelyTyped
 * package (`@types/hosted-git-info@3.0.5`, 2023) targets a pre-v7 API. This
 * declares only what `git-url.ts` calls.
 */
declare module 'hosted-git-info' {
  export interface GitHost {
    type: string
    domain: string
    user: string | null
    project: string
    /** Empty string when the input had no `#committish` suffix. */
    committish: string
    ssh(opts?: Record<string, unknown>): string
    sshurl(opts?: Record<string, unknown>): string
    https(opts?: Record<string, unknown>): string
    browse(path?: string, fragment?: string, opts?: Record<string, unknown>): string
  }

  function fromUrl(gitSpecifier: string, opts?: Record<string, unknown>): GitHost | undefined

  const hostedGitInfo: { fromUrl: typeof fromUrl }
  export default hostedGitInfo
}
