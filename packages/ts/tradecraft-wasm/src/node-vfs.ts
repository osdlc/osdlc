/**
 * The `Vfs` the core's wasm binding is handed: Node's synchronous `fs`.
 *
 * A host that runs on Node, such as a desktop app, passes it to the binding. It
 * always has Node's `fs` underneath and implements the link methods.
 *
 * Paths cross to the core in its `/` form. On Windows each path the core
 * passes in is converted to the host's spelling before an `fs` call, and each
 * path an `fs` call answers with is converted back (see `host-path.ts`).
 *
 * Synchronous by design: the core (`tradecraft-core::publish_skill`) is
 * synchronous end to end, so every host bridge is too — see
 * `packages/rust/tradecraft-wasm/src/js_vfs.rs`.
 */

import * as nodeFs from 'node:fs'

import { linkTargetToCore, pathError, toCorePath, toHostPath } from './host-path.ts'

/** Bits that mean "executable" for owner, group, or other. */
const EXECUTABLE_BITS = 0o111

/** Permission bits, i.e. everything `chmod` is allowed to set. */
const PERMISSION_BITS = 0o7777

/**
 * The filesystem the core is handed, rather than one it reaches for itself.
 * Mirrors `tradecraft_core::Vfs` exactly — see
 * `packages/rust/tradecraft-core/src/vfs.rs` and the host contract documented in
 * `packages/rust/tradecraft-wasm/src/js_vfs.rs`.
 */
export interface BaseVfs {
  readFile(path: string): Uint8Array
  readDir(path: string): Array<{ name: string; isDir: boolean }>
  writeFile(path: string, bytes: Uint8Array): void
  createDirAll(path: string): void
  exists(path: string): boolean
  isExecutable(path: string): boolean
  setExecutable(path: string, yes: boolean): void
  /**
   * Move a file, or a directory with everything under it.
   *
   * The additive pair (`rename`, `remove`) joined the contract with the
   * marketplace's atomic commit, which stages a rendered root beside the live
   * one and swaps the two by rename. A host that predates them keeps working
   * until something actually renames — see `packages/rust/tradecraft-wasm/src/js_vfs.rs`
   * — but `exportSkills` renames, so it implements both.
   *
   * Deliberately narrower than `fs.renameSync`: `to` must NOT exist. POSIX
   * silently replaces an occupied destination where Windows refuses, and a seam
   * that passed the platform's answer through would make one swap succeed on one
   * host and fail on another.
   */
  rename(from: string, to: string): void
  /**
   * Remove a file, or a directory and everything under it.
   *
   * Removing what is not there is an error rather than a no-op: the callers
   * this serves — the swap's rollback, the stage teardown — know exactly what
   * they expect to remove, and a silent pass would hide the moment they are
   * wrong about it.
   */
  remove(path: string): void
}

/**
 * The link questions. With all three the core can see symlinks, so it runs its
 * symlink-aware checks and the narrowed rails that rely on them (an export
 * whose out root holds the vault, for one). A host without real filesystem
 * access leaves them out and gets the strict rails. The throws are part of the
 * contract — see `packages/rust/tradecraft-wasm/src/js_vfs.rs`.
 */
export interface LinkMethods {
  /** `path` with every symlink resolved. Throws with `code` `ENOENT` or `ENOTDIR` only when it is missing. */
  realpath(path: string): string
  /** The target text of the link at `path`, unresolved. Throws with `code` `EINVAL` only when it is not a link. */
  readLink(path: string): string
  /** Is `path` itself a symlink? Not followed; `false` when nothing is there. */
  isSymlink(path: string): boolean
}

/** All three link methods, or none of them. */
export type Vfs = BaseVfs & (LinkMethods | { [K in keyof LinkMethods]?: never })

/** The `node:fs` calls this host makes, so a test can stand in for them. */
export type NodeFs = Pick<
  typeof nodeFs,
  | 'readFileSync'
  | 'readdirSync'
  | 'writeFileSync'
  | 'mkdirSync'
  | 'existsSync'
  | 'statSync'
  | 'chmodSync'
  | 'lstatSync'
  | 'renameSync'
  | 'rmSync'
  | 'unlinkSync'
  | 'realpathSync'
  | 'readlinkSync'
>

export interface NodeVfsOptions {
  /** Whose path rules apply. Defaults to `process.platform`. */
  platform?: string
  /** The filesystem calls. Defaults to `node:fs`. */
  fs?: NodeFs
}

/** Build a `Vfs` backed by the local filesystem via `node:fs`. */
export function createNodeVfs(options: NodeVfsOptions = {}): BaseVfs & LinkMethods {
  const fs = options.fs ?? nodeFs
  const platform = options.platform ?? process.platform
  /**
   * The host spelling of a core path, or `null` for `/`, `/UNC` or
   * `/UNC/<server>`. Those exist, list nothing and resolve to themselves.
   */
  const hostOrNull = (path: string): string | null => toHostPath(path, platform)
  /** The host spelling of a core path that must name a real one. */
  const host = (path: string): string => {
    const converted = hostOrNull(path)
    if (converted === null) throw pathError(`${path} is not a directory on this host`, 'ENOENT')
    return converted
  }

  return {
    readFile(path: string): Uint8Array {
      // Copy out of the Buffer: Node pools its backing ArrayBuffer, and the
      // core must not see a view onto memory Node may reuse.
      return new Uint8Array(fs.readFileSync(host(path)))
    },

    readDir(path: string): Array<{ name: string; isDir: boolean }> {
      // A name above a drive or share is a directory with nothing listed.
      const converted = hostOrNull(path)
      if (converted === null) return []
      return fs
        .readdirSync(converted, { withFileTypes: true })
        .map((entry) => ({ name: entry.name, isDir: entry.isDirectory() }))
    },

    writeFile(path: string, bytes: Uint8Array): void {
      fs.writeFileSync(host(path), bytes)
    },

    createDirAll(path: string): void {
      const converted = hostOrNull(path)
      if (converted !== null) fs.mkdirSync(converted, { recursive: true })
    },

    exists(path: string): boolean {
      const converted = hostOrNull(path)
      return converted === null || fs.existsSync(converted)
    },

    isExecutable(path: string): boolean {
      return (fs.statSync(host(path)).mode & EXECUTABLE_BITS) !== 0
    },

    setExecutable(path: string, yes: boolean): void {
      const mode = fs.statSync(host(path)).mode
      const next = yes ? mode | EXECUTABLE_BITS : mode & ~EXECUTABLE_BITS
      fs.chmodSync(host(path), next & PERMISSION_BITS)
    },

    rename(from: string, to: string): void {
      // `lstatSync`, so a destination that is a link counts as occupied — the
      // link, not its target, is what a rename onto it would clobber. This is
      // the contract's refusal, not the platform's; see the interface above.
      if (fs.lstatSync(host(to), { throwIfNoEntry: false }) !== undefined) {
        throw new Error(`${to} is in the way: rename requires a free destination`)
      }
      fs.renameSync(host(from), host(to))
    },

    remove(path: string): void {
      // `lstatSync` again, so a link is removed as itself rather than followed:
      // it reports as not-a-directory, `unlinkSync` unlinks it, and whatever it
      // pointed at is untouched. It also throws ENOENT on a missing path, which
      // is the contract's answer rather than a silent pass.
      const target = host(path)
      if (fs.lstatSync(target).isDirectory()) {
        fs.rmSync(target, { recursive: true })
      } else {
        fs.unlinkSync(target)
      }
    },

    realpath(path: string): string {
      // `/`, `/UNC` and `/UNC/<server>` resolve to themselves, so the core can
      // walk down to a drive or share one part at a time.
      const converted = hostOrNull(path)
      if (converted === null) return path
      // `.native` is realpath(3) (GetFinalPathNameByHandle on Windows), the
      // call Rust's `std::fs::canonicalize` makes. An answer that is not a
      // drive or share path (a volume GUID path, say) throws, so the check refuses.
      return toCorePath(fs.realpathSync.native(converted), platform)
    },

    readLink(path: string): string {
      const converted = hostOrNull(path)
      if (converted === null) throw pathError(`${path} is not a link`, 'EINVAL')
      return linkTargetToCore(fs.readlinkSync(converted), path, platform)
    },

    isSymlink(path: string): boolean {
      const converted = hostOrNull(path)
      if (converted === null) return false
      return fs.lstatSync(converted, { throwIfNoEntry: false })?.isSymbolicLink() ?? false
    },
  }
}
