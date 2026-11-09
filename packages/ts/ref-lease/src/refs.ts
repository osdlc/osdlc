/** Internal: the shape checks every operation runs on refs and shas first. */

/**
 * Ref namespaces a lease may not use. A fetch force-updates the local copy of
 * every ref it reads and prunes the ones the authority lacks, so a lease
 * "namespace" of `refs/heads` would overwrite or delete the caller's own
 * branches.
 */
const RESERVED = ['refs/heads', 'refs/tags', 'refs/remotes']

/**
 * A lease ref, or a namespace prefix, must be a path under `refs/` outside the
 * reserved namespaces.
 *
 * @throws TypeError otherwise.
 */
export function checkLeaseRef(ref: string, what: string): void {
  if (!/^refs\/[^/]/.test(ref)) {
    throw new TypeError(
      `${what} ${JSON.stringify(ref)} must be a path under refs/, such as refs/locks`,
    )
  }
  const reserved = RESERVED.find((r) => ref === r || ref.startsWith(`${r}/`))
  if (reserved !== undefined) {
    throw new TypeError(
      `${what} ${JSON.stringify(ref)} is under ${reserved}, which holds your own refs; ` +
        'use a namespace of your own, such as refs/locks',
    )
  }
}

/** A full object id: 40 (SHA-1) or 64 (SHA-256) lowercase hex digits. */
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/

/**
 * A sha the protocol compares must be a full lowercase object id: an
 * abbreviated or upper-case one would not match what git reports.
 *
 * @throws TypeError otherwise.
 */
export function checkSha(sha: string, what: string): void {
  if (!OID.test(sha)) {
    throw new TypeError(`${what} ${JSON.stringify(sha)} is not a full lowercase object id`)
  }
}
