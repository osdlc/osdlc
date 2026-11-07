/**
 * Build a lease commit: a commit whose tree holds the payload as canonical JSON
 * and, optionally, further files beside it. It is written with git plumbing
 * (`hash-object`, `mktree`, `commit-tree`), so it touches no index, work tree
 * or branch.
 */

import { canonicalJson } from './canonical-json.ts'
import { DEFAULT_PAYLOAD_FILE } from './primitives.ts'
import { client, gitFailed, gitFailedFrom, type GitOptions } from './git.ts'

/** The author and committer of lease commits. */
export interface LeaseIdentity {
  name: string
  email: string
}

/**
 * The identity used when a caller names none. It is the same on every host, so
 * two hosts that build the same payload on the same parent at the same date get
 * the same commit.
 */
export const DEFAULT_IDENTITY: LeaseIdentity = Object.freeze({
  name: 'ref-lease',
  email: 'ref-lease@local',
})

/**
 * A fixed commit date for tests that need the same commit sha on every run.
 * Production callers leave `commitDate` unset and get the current time.
 */
export const DETERMINISTIC_EPOCH = '1970-01-01T00:00:00+0000'

/** Options for {@link buildLeaseCommit}. */
export interface BuildLeaseCommitOptions extends GitOptions {
  /** The previous lease commit, so the ref's log is the lease's history. */
  parentSha?: string | null
  /** Further parents after `parentSha`, for a commit that joins two histories. */
  extraParentShas?: readonly string[]
  /** The blob name for the payload. Default `lease.json`. */
  payloadFile?: string
  /**
   * Further files in the commit's tree, by name, written as given. A name is
   * one path segment: no `/`, no control characters, not `.` or `..`, and not
   * the payload file's name.
   */
  files?: Readonly<Record<string, string>>
  /** Default {@link DEFAULT_IDENTITY}. */
  identity?: LeaseIdentity
  /**
   * The author and committer date, in a form git accepts, such as
   * `2026-05-31T19:23:45+0000`. Default: now, to the second.
   */
  commitDate?: string | null
  /** The commit message. Default `lease`. */
  message?: string
}

/** A tree entry's name: one path segment, no control characters. */
function checkSegment(name: string): void {
  // eslint-disable-next-line no-control-regex
  if (name === '' || name === '.' || name === '..' || /[/\x00-\x1f\x7f]/.test(name)) {
    throw new TypeError(`buildLeaseCommit: ${JSON.stringify(name)} is not a single path segment`)
  }
}

function nowCommitDate(): string {
  // `2026-05-31T19:23:45+0000`: whole seconds, UTC.
  return new Date().toISOString().replace(/\.\d{3}Z$/, '+0000')
}

/**
 * Write the payload, and any `files`, as a commit in the local repository and
 * return its sha. The commit is not on any ref until a compare-and-swap puts it
 * there.
 *
 * The payload is encoded with {@link canonicalJson}, so equal payloads give
 * equal blobs. The commit sha also depends on the parents, identity, date and
 * message.
 *
 * @throws TypeError for a payload {@link canonicalJson} cannot encode, or a bad
 *   file name.
 * @throws GitFailed when git cannot write the objects.
 */
export function buildLeaseCommit(payload: unknown, opts: BuildLeaseCommitOptions = {}): string {
  const payloadFile = opts.payloadFile ?? DEFAULT_PAYLOAD_FILE
  checkSegment(payloadFile)
  const files = opts.files ?? {}
  for (const name of Object.keys(files)) {
    checkSegment(name)
    if (name === payloadFile) {
      throw new TypeError(`buildLeaseCommit: ${JSON.stringify(name)} is the payload file`)
    }
  }
  const git = client(opts)
  // hash-object and mktree are plumbing with no typed verb.
  const write = (argv: string[], input: string): string => {
    const res = git.raw(argv, { input })
    if (res.exitCode !== 0) throw gitFailed('BUILD-COMMIT', `git ${argv[0]} failed`, res)
    return res.stdout.trim()
  }
  const blob = (content: string) => write(['hash-object', '-w', '--stdin'], content)

  const entries = [`100644 blob ${blob(canonicalJson(payload))}\t${payloadFile}`]
  for (const [name, content] of Object.entries(files)) {
    entries.push(`100644 blob ${blob(content)}\t${name}`)
  }
  const tree = write(['mktree'], entries.join('\n') + '\n')

  const { name, email } = opts.identity ?? DEFAULT_IDENTITY
  const date = opts.commitDate ?? nowCommitDate()
  const parents = [
    ...(opts.parentSha == null ? [] : [opts.parentSha]),
    ...(opts.extraParentShas ?? []),
  ]
  const committed = git.try.commitTree(
    tree,
    { parents, message: opts.message ?? 'lease' },
    {
      env: {
        GIT_AUTHOR_NAME: name,
        GIT_AUTHOR_EMAIL: email,
        GIT_COMMITTER_NAME: name,
        GIT_COMMITTER_EMAIL: email,
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date,
      },
    },
  )
  if (!committed.ok) throw gitFailedFrom('BUILD-COMMIT', 'git commit-tree failed', committed.error)
  return committed.value
}
