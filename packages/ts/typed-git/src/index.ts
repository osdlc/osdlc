/**
 * `@osdlc/typed-git` — a typed git client for TypeScript, in a synchronous
 * and an awaitable form.
 *
 * Two clients with the same methods:
 *
 *   - {@link Git} is synchronous and always runs the `git` CLI. Git calls run
 *     one after another gain nothing from being awaited, and a sync client
 *     does not force its callers to be async. It takes a `CommandRunner`, so
 *     tests can pass a fake.
 *   - {@link AsyncGit} is awaitable and takes a {@link GitBackend}, which
 *     replaces what performs git, not how a process is spawned. The default
 *     backend runs the CLI. Any other implementation works with the same
 *     client.
 *
 * Both clients follow one contract. A declared absence returns a value,
 * everything else throws, `try` returns the failure instead of throwing, and
 * `raw` skips the checks. Each verb names the exit codes that mean "not
 * there" for it, such as an unset config key or a ref that does not resolve,
 * and those return `null` / `[]` / `false`. Every other non-zero exit throws
 * the classified failure, so "git broke" is distinct from "nothing there".
 * `git.try.*` is for callers that must tolerate failure. `git.soft.*` is for
 * callers whose fallback is the verb's own absence value.
 *
 * The verb table in `./verbs.ts` is the single definition of every argv,
 * every absence code and every parser, so the two clients cannot drift apart.
 * The one exception is `remoteOwnerRepo`, which calls `remoteGetUrl` and then
 * `parseRemoteUrl`, and is written in each client.
 *
 * Subpath exports: `./client` is everything here except the git-reference
 * parsers and the checkout walks (and so without `hosted-git-info` on the
 * module graph); `./testing` is the temp-repo fixture builder.
 */

export * from './client.ts'

export {
  parseGitUrl,
  gitSshUrl,
  parseRepoRef,
  type GitHostInfo,
  type RepoRef,
  type CloneProtocol,
} from './git-url.ts'

export {
  checkoutRoot,
  discoverCheckouts,
  scanForCheckouts,
  DEFAULT_MAX_DEPTH,
  DEFAULT_WARN_AFTER,
} from './checkout-root.ts'
export type { CheckoutScan, DiscoverCheckoutsOptions } from './checkout-root.ts'
