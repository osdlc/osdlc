/**
 * `@osdlc/typed-git` — a typed git client for TypeScript, in a synchronous
 * and an awaitable form.
 *
 * Two clients, one surface:
 *
 *   - {@link Git} is synchronous and always shells out. Sequential git
 *     one-shots gain nothing from being awaited, and staying sync keeps a
 *     caller's call graph uncolored. It takes a `CommandRunner`, so tests
 *     inject a fake.
 *   - {@link AsyncGit} is awaitable and takes a {@link GitBackend} — a seam
 *     over *what performs git*, not over how a process is spawned. The
 *     default backend runs the CLI; any other implementation drives the same
 *     client unchanged.
 *
 * One contract, both clients: **declared absence returns a value; everything
 * else throws; `try` inspects; `raw` bypasses.** Each verb names the exit
 * codes that mean "not there" for it — an unset config key, a ref that does
 * not resolve — and those return `null` / `[]` / `false`. Every other non-zero
 * exit throws `CommandFailed`, so "git broke" is distinct from "nothing there".
 * `git.try.*` is the door for callers that must tolerate failure; `git.soft.*`
 * for those whose fallback is the verb's own absence value.
 *
 * The verb table in `./verbs.ts` is the single definition of every argv,
 * every absence code and every parser, so the two clients cannot drift apart.
 * The one exception is `remoteOwnerRepo`, a composite of `remoteGetUrl` plus
 * `parseRemoteUrl` written in each client.
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
