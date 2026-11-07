/**
 * The namespace-conflict guard. git cannot store a ref at a path `P` and refs
 * under `P/` at once, so a literal ref at the namespace path (`refs/locks`)
 * makes every create under it (`refs/locks/...`) fail with a git plumbing
 * error. Run the guard once against an authority before the first write, to
 * turn that into one clear error.
 */

import { NamespaceConflict } from './errors.ts'
import { checkLeaseRef } from './refs.ts'
import { C_LOCALE, client, gitFailedFrom, type GitOptions } from './git.ts'

/** Options for {@link checkNamespaceConflict}. */
export interface CheckNamespaceConflictOptions extends GitOptions {
  /** What the reader should do, appended to the error message. A generic hint by default. */
  remediation?: string
}

function defaultRemediation(ref: string): string {
  return (
    `delete the offending ref (${ref}) on the authority ` +
    `(e.g. \`git push <authority> :${ref}\`), or pick a different namespace; then retry`
  )
}

/**
 * Ask the authority (`git ls-remote`) whether a literal ref sits at
 * `namespaceRef`. Refs under it are the protocol's normal state and pass.
 *
 * Each call asks the authority again. A caller that checks before every write
 * keeps its own record of authorities already checked.
 *
 * @param namespaceRef The namespace's ref path, such as `refs/locks`.
 * @throws NamespaceConflict when the literal ref exists.
 * @throws GitFailed when the authority cannot be asked.
 * @throws TypeError for a namespace outside `refs/`, or under `refs/heads`, `refs/tags` or `refs/remotes`.
 */
export function checkNamespaceConflict(
  authority: string,
  namespaceRef: string,
  opts: CheckNamespaceConflictOptions = {},
): void {
  checkLeaseRef(namespaceRef, 'NAMESPACE-CHECK: namespace')
  const listing = client(opts).try.lsRemote(authority, namespaceRef, C_LOCALE)
  if (!listing.ok) {
    throw gitFailedFrom(
      'NAMESPACE-CHECK',
      `git ls-remote failed for namespace-conflict check on ${JSON.stringify(authority)}`,
      listing.error,
    )
  }
  for (const row of listing.value) {
    if (row.ref === namespaceRef) {
      throw new NamespaceConflict({
        ref: row.ref,
        sha: row.sha,
        remediation: opts.remediation ?? defaultRemediation(row.ref),
      })
    }
  }
}
