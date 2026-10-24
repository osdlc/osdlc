/**
 * A content digest over the files a cached answer depends on.
 *
 * The question this answers is narrow: given a stored probe result, have the
 * inputs that produced it changed? A digest that matches means serving the
 * stored report; a digest that differs means re-probing.
 *
 * ## Content, never mtime
 *
 * Files are hashed by their bytes. `touch`ing a justfile does not invalidate,
 * and neither does a rewrite to identical bytes — which is what a formatter, a
 * `git checkout` of the same content, or a rebuild of a generated file does all
 * day. An mtime-keyed cache would miss on all of those and re-pay a JVM start
 * for nothing.
 *
 * ## What it covers
 *
 * For a `parse` runner, exactly what it read: every read goes through `ctx`,
 * and the files detection rested on are added. For an `exec` runner, only its
 * markers: the files its tool merges (moon's per-project `moon.yml`, nested
 * `mise.toml`) are never read here, which is why `RunnerRole.watch` exists
 * and why exec entries also expire with age.
 *
 * ## Why a recorded DIRECTORY hashes its entries
 *
 * `ctx.exists()` on a directory is nearly worthless as a fingerprint input.
 * `mise-tasks/` exists before a task file is added inside it and exists after,
 * so an existence bit never changes and the cache never invalidates. A
 * directory therefore hashes the sorted list of its immediate entry NAMES: a
 * new task file, or a removed one, moves the digest. Entry names only, not a
 * recursive content walk — the names are what decides the task set for a
 * file-task directory, and a recursive hash of an arbitrary tree is an
 * unbounded cost on the read path.
 *
 * ## Patterns
 *
 * `watch` and the recorded queries use `ctx.files()`'s pattern language, and
 * are re-expanded on every read, so a file that appears later matching the
 * same pattern moves the digest.
 *
 * ## The honest residual limit
 *
 * A task set can change with no watched file changing: a plugin version
 * resolving differently, a global `~/.config/mise/config.toml`, an environment
 * variable read by a build script. The watch set is a good signal, not a proof.
 * Every consumer of this digest must be able to tolerate a stale hit — which is
 * what the reported staleness and the exec max age are for.
 */

import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { readdir, readFile, stat } from 'node:fs/promises'

/**
 * Ceiling on how many paths one fingerprint hashes.
 *
 * A repository can hold thousands of `build.gradle` files, and hashing all of
 * them on every read would cost more than the probe the cache exists to avoid.
 * Hitting the cap is not silent: {@link Fingerprint.truncated} says so, and the
 * caller reports it as a diagnostic — a truncated fingerprint can miss a change
 * beyond the cap, and a user seeing an occasional stale answer deserves to be
 * told why.
 */
export const MAX_FINGERPRINT_FILES = 256

export interface Fingerprint {
  /** sha256 over every path and its per-path hash, in path order. */
  digest: string
  /** The paths actually hashed, sorted, after the cap. */
  paths: string[]
  /**
   * The patterns re-expanded to build the candidate set, sorted. Stored so the
   * read path can ask the same questions again without the runner having run
   * — a stored path list describes the world as it was, and the patterns are
   * what notice a file that has appeared since.
   */
  patterns: string[]
  /** True when the candidate set exceeded {@link MAX_FINGERPRINT_FILES}. */
  truncated: boolean
  /**
   * The exclusion set the patterns were expanded under, sorted.
   *
   * Stored because it is part of what the digest MEANS, not part of what it
   * covers. Every other input here is a file whose bytes the digest hashes; an
   * exclusion changes which files the patterns can see at all, and it lives
   * outside the tree in a config file, so no amount of hashing the repository
   * notices it.
   *
   * Without this, adding an exclusion leaves every entry `fresh` — the recorded
   * paths still exist with the same bytes — and the tasks just excluded go on
   * being served out of the store until something unrelated changes.
   */
  excludes: string[]
}

/** A path that is not there hashes to this, so a DELETION moves the digest. */
const MISSING = 'missing'

export async function fingerprint(args: {
  root: string
  /** Paths the runner actually read, root-relative. */
  paths: readonly string[]
  /**
   * Patterns to re-expand: the runner's declared `watch` together with every
   * pattern it queried through `ctx.files()`. The two get identical treatment
   * on purpose — a queried pattern IS a watch the runner never had to write
   * down, and a runner that discovers by listing depends on the answer to its
   * query rather than only on the files that answer happened to name.
   */
  patterns: readonly string[]
  /**
   * The exclusion set in force, recorded rather than hashed. See
   * {@link Fingerprint.excludes}.
   */
  excludes?: readonly string[]
  files: (pattern: string) => Promise<string[]>
}): Promise<Fingerprint> {
  const { root, paths, patterns, files } = args
  const excludes = [...(args.excludes ?? [])].sort()

  const candidates = new Set<string>(paths)
  // Re-expanded on every call, never taken from the stored entry: the whole
  // point of a pattern is to catch a file that did not exist when the recorded
  // reads were recorded, and a stored path list can only ever describe the
  // world as it was.
  const expanded = new Set<string>(patterns)
  for (const pattern of expanded) {
    for (const path of await files(pattern)) candidates.add(path)
  }

  // Sort BEFORE the cap so the cap is deterministic: the same repository must
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
      // Readable as a directory a moment ago, unreadable now — treat it as gone
      // rather than throwing. A fingerprint that throws turns a permissions
      // quirk into a crash on the read path.
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
