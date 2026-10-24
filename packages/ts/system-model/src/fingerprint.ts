/**
 * A content digest over the files a cached answer depends on.
 *
 * It answers one question: have the inputs that produced a stored probe
 * result changed? A matching digest means the stored report is used. A
 * different digest means the runner probes again.
 *
 * ## Content, never mtime
 *
 * Files are hashed by their bytes. `touch`ing a justfile does not invalidate
 * the entry. Nor does rewriting a file with identical bytes, which formatters,
 * a `git checkout` of the same content, and generated-file rebuilds do often.
 * An mtime-based cache would miss on all of those and pay for a JVM start for
 * nothing.
 *
 * ## What it covers
 *
 * For a `parse` runner, exactly what it read. Every read goes through `ctx`,
 * and the files detection used are added. For an `exec` runner, only its
 * markers. The files its tool merges (moon's per-project `moon.yml`, nested
 * `mise.toml`) are never read here. That is why `RunnerRole.watch` exists,
 * and why exec entries also expire with age.
 *
 * ## Why a recorded directory hashes its entries
 *
 * Whether a directory exists says almost nothing as a fingerprint input.
 * `mise-tasks/` exists before a task file is added inside it and after, so
 * an existence check never changes and the cache never invalidates. So a
 * directory hashes the sorted list of its immediate entry names. A new or
 * removed task file changes the digest. Only entry names are hashed, not the
 * contents of the whole tree. The names decide the task set for a file-task
 * directory, and hashing an arbitrary tree recursively has no cost limit.
 *
 * ## Patterns
 *
 * `watch` and the recorded queries use `ctx.files()`'s pattern language. They
 * are expanded again on every read, so a new file that matches the same
 * pattern changes the digest.
 *
 * ## Known limit
 *
 * A task set can change with no watched file changing: a plugin version
 * resolving differently, a global `~/.config/mise/config.toml`, an environment
 * variable read by a build script. The watch set is a good sign, not a proof.
 * Every user of this digest must accept that a hit can be stale. The reported
 * staleness and the exec maximum age exist for that.
 */

import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { readdir, readFile, stat } from 'node:fs/promises'

/**
 * The maximum number of paths one fingerprint hashes.
 *
 * A repository can hold thousands of `build.gradle` files. Hashing all of them
 * on every read would cost more than the probe the cache exists to avoid.
 * Reaching the cap is not silent. {@link Fingerprint.truncated} says so, and
 * the caller reports it as a diagnostic. A truncated fingerprint can miss a
 * change beyond the cap, and a user who sees a stale answer should be told why.
 */
export const MAX_FINGERPRINT_FILES = 256

export interface Fingerprint {
  /** sha256 over every path and its per-path hash, in path order. */
  digest: string
  /** The paths actually hashed, sorted, after the cap. */
  paths: string[]
  /**
   * The patterns expanded to build the candidate set, sorted. Stored so the
   * read path can expand them again without running the runner. A stored path
   * list only describes the files as they were. The patterns find a file that
   * has appeared since.
   */
  patterns: string[]
  /** True when the candidate set exceeded {@link MAX_FINGERPRINT_FILES}. */
  truncated: boolean
  /**
   * The exclusion set the patterns were expanded under, sorted.
   *
   * Stored because it is part of what the digest means, not part of what it
   * covers. Every other input here is a file whose bytes the digest hashes. An
   * exclusion changes which files the patterns can see at all. It lives in a
   * config file outside the tree, so hashing the repository never detects it.
   *
   * Without this, adding an exclusion leaves every entry `fresh`, because the
   * recorded paths still exist with the same bytes. The tasks just excluded
   * would still be served from the store until something unrelated changes.
   */
  excludes: string[]
}

/** A missing path hashes to this, so a deletion changes the digest. */
const MISSING = 'missing'

export async function fingerprint(args: {
  root: string
  /** Paths the runner actually read, root-relative. */
  paths: readonly string[]
  /**
   * Patterns to expand again: the runner's declared `watch` plus every
   * pattern it queried through `ctx.files()`. Both are treated the same on
   * purpose. A queried pattern is a watch the runner did not have to declare.
   * A runner that finds files by listing depends on the result of its query,
   * not only on the files that result named.
   */
  patterns: readonly string[]
  /**
   * The exclusion set in use, recorded rather than hashed. See
   * {@link Fingerprint.excludes}.
   */
  excludes?: readonly string[]
  files: (pattern: string) => Promise<string[]>
}): Promise<Fingerprint> {
  const { root, paths, patterns, files } = args
  const excludes = [...(args.excludes ?? [])].sort()

  const candidates = new Set<string>(paths)
  // Expanded on every call, never taken from the stored entry. A pattern is
  // there to catch a file that did not exist when the reads were recorded,
  // and a stored path list only describes the files as they were.
  const expanded = new Set<string>(patterns)
  for (const pattern of expanded) {
    for (const path of await files(pattern)) candidates.add(path)
  }

  // Sort before the cap so the cap is deterministic. The same repository must
  // hash the same 256 paths on every run, or the digest changes for reasons
  // that have nothing to do with the files.
  const sorted = [...candidates].sort()
  const truncated = sorted.length > MAX_FINGERPRINT_FILES
  const kept = truncated ? sorted.slice(0, MAX_FINGERPRINT_FILES) : sorted

  const digest = createHash('sha256')
  for (const rel of kept) {
    digest.update(`${rel}\n${await hashPath(join(root, rel))}\n`)
  }

  return {
    digest: digest.digest('hex'),
    paths: kept,
    patterns: [...expanded].sort(),
    truncated,
    excludes,
  }
}

/** A file hashes its bytes, a directory its immediate entry names. */
async function hashPath(abs: string): Promise<string> {
  let info
  try {
    info = await stat(abs)
  } catch {
    return MISSING
  }

  if (info.isDirectory()) {
    try {
      const entries = (await readdir(abs)).sort()
      return createHash('sha256')
        .update(`dir\n${entries.join('\n')}`)
        .digest('hex')
    } catch {
      // It was a directory a moment ago but cannot be read now. Treat it as
      // gone rather than throwing. A fingerprint that throws turns a
      // permissions problem into a crash on the read path.
      return MISSING
    }
  }

  try {
    return createHash('sha256')
      .update(await readFile(abs))
      .digest('hex')
  } catch {
    return MISSING
  }
}
