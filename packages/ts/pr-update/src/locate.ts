/**
 * The standalone run's `locate`: a `--repo` target's checkout already on this
 * machine, found by its `origin`.
 *
 * It is `CheckoutLocator` from `@osdlc/ecosystem`. The roots come from the
 * family file `repositories.yaml`, or, when it names none, from the directory
 * that holds the project root's main checkout. One locator serves the whole
 * run, so the roots are scanned once, however many targets there are and
 * however often each is asked about.
 *
 * A found checkout is read through `origin`, the remote that matched,
 * whatever `--remote` says: `--remote` names a remote of the project root.
 * A shallow checkout is skipped, since it cannot measure drift.
 *
 * With no usable checkout, a managed clone that already exists serves the
 * target (`mirror.ts`). This module never makes one: only `update --apply`
 * does, before its survey.
 *
 * A host that supplies its own `Ports` supplies its own `locate`, and this
 * module is not used.
 */

import type { CommandRunner } from '@osdlc/command-seam'
import { CheckoutLocator, type LocateOptions } from '@osdlc/ecosystem/repositories'
import { Git } from '@osdlc/typed-git'

import type { FoundCheckout, LocateTarget } from './ports.ts'
import { targetGitOptions } from './update/execute.ts'

/** Options for {@link standaloneLocate}. */
export interface StandaloneLocateOptions {
  /** The project root. The default roots are worked out from its main checkout; without it there are none. */
  projectRoot?: string | undefined
  /** Runs git. Defaults to typed-git's. */
  git?: CommandRunner | undefined
  /** The environment the osdlc directories and the home directory are read from. Defaults to `process.env`. */
  env?: Record<string, string | undefined> | undefined
  /** One-line notes for the person: a target not found, and where the search looked. */
  notice?: ((line: string) => void) | undefined
  /** Passed to the locator as given: `resolveAlias` (the CLI passes its own), and for a test `dirs`, `home`, `maxDepth`. */
  locator?: Pick<LocateOptions, 'resolveAlias' | 'dirs' | 'home' | 'maxDepth'> | undefined
  /** The run's managed clones, the fallback for a target with no usable checkout. Default none. */
  clones?: CloneLookup | undefined
}

/** A target with no usable checkout, as {@link CloneLookup.missed} is told about it. */
export interface MissedCheckout {
  /** The target as notes name it, `host/owner/name`. */
  label: string
  /** Where the search looked, as the not-found note says it: `no checkout under <roots> (…)`. */
  where: string
  /** The shallow checkouts of it that were skipped. */
  shallow: string[]
}

/** How {@link standaloneLocate} reaches the run's managed clones. */
export interface CloneLookup {
  /** The clone that serves `target`, when one exists and the run may use it, else null. */
  existing(target: LocateTarget): string | null
  /**
   * True in `update --apply`, whose clone step speaks for a target with no checkout and no
   * clone: locate then prints no note for it, so the person reads one line, not two.
   */
  deferMissing: boolean
  /** Told about each target with neither a usable checkout nor a clone. */
  missed(target: LocateTarget, miss: MissedCheckout): void
}

/**
 * A `Ports.locate` over one {@link CheckoutLocator}, made on the first call so
 * a run with no `--repo` reads no file and scans nothing. Each target is
 * resolved once, and its notes printed once.
 *
 * Every match resolves to its main checkout. With more than one, the first by
 * path serves the run and the note names the others. They are returned as
 * `others`, shallow ones too, since the `unpushed_local` guard reads every
 * checkout that could hold a branch's unpushed commits.
 */
export function standaloneLocate(
  opts: StandaloneLocateOptions = {},
): (repo: string, target?: LocateTarget) => FoundCheckout | null {
  const notice = opts.notice ?? (() => {})
  let locator: CheckoutLocator | undefined
  const resolved = new Map<string, FoundCheckout | null>()

  const find = (repo: string, target: LocateTarget | undefined): FoundCheckout | null => {
    locator ??= new CheckoutLocator({
      ...opts.locator,
      ...(opts.projectRoot === undefined ? {} : { caller: opts.projectRoot }),
      ...(opts.git === undefined ? {} : { runner: opts.git }),
      ...(opts.env === undefined ? {} : { env: opts.env }),
      onWarn: notice,
    })
    const label = target === undefined ? repo : `${target.host}/${repo}`
    const matches = locator.locate(
      target === undefined ? repo : { host: target.host, owner: target.owner, repo: target.name },
    )
    const shallow: string[] = []
    const usable = matches.filter((m) => {
      if (!isShallow(m.path, opts.git)) return true
      notice(`${label}: ${m.path} is shallow, so it is not used`)
      shallow.push(m.path)
      return false
    })
    const [first, ...rest] = usable
    if (first === undefined) {
      const where = notFound(locator)
      const clone = target === undefined ? null : (opts.clones?.existing(target) ?? null)
      if (clone !== null) {
        notice(`${label}: ${where}; using the clone ${clone}`)
        // A shallow checkout cannot be measured, but can hold unpushed commits.
        return {
          path: clone,
          source: 'clone',
          remote: 'origin',
          ...(shallow.length > 0 ? { others: shallow } : {}),
        }
      }
      if (target !== undefined && opts.clones !== undefined) {
        opts.clones.missed(target, { label, where, shallow })
        if (opts.clones.deferMissing && target.github === true) return null
      }
      notice(`${label}: ${where}${cloneHint(target)}`)
      return null
    }
    if (rest.length > 0) {
      notice(
        `${label}: using ${first.path}; also checked out at ${rest.map((o) => o.path).join(', ')}`,
      )
    }
    const others = matches.filter((m) => m.path !== first.path).map((m) => m.path)
    return {
      path: first.path,
      source: 'located',
      remote: 'origin',
      ...(others.length > 0 ? { others } : {}),
    }
  }

  return (repo, target) => {
    const key = target === undefined ? repo : `${target.host}/${repo}`
    if (!resolved.has(key)) resolved.set(key, find(repo, target))
    return resolved.get(key) ?? null
  }
}

/** What the not-found note adds about a managed clone: how to allow one, or that none is made. */
function cloneHint(target: LocateTarget | undefined): string {
  if (target?.github === true) {
    return '; run `pr-update mirror enable` so `update --apply` can clone it'
  }
  if (target?.github === false) {
    return `; there is no managed clone for ${target.host}: only GitHub repositories are cloned`
  }
  return ''
}

/** Where the search for a target looked, and where that is set, for the not-found note. */
function notFound(locator: CheckoutLocator): string {
  const where =
    locator.roots.length === 0
      ? 'no checkout found: no roots to search'
      : `no checkout under ${locator.roots.join(', ')}`
  const from =
    locator.source === 'file'
      ? `the roots are set in ${locator.file}`
      : `set the roots in ${locator.file}`
  const limited = locator.depthLimited
  const deeper =
    limited === 0
      ? ''
      : `; ${limited} ${limited === 1 ? 'directory was' : 'directories were'} not opened past the depth limit, so a checkout may sit deeper`
  return `${where} (${from})${deeper}`
}

/** Whether the checkout at `path` is shallow. Unknown counts as not shallow: the measure then says what it can. */
function isShallow(path: string, runner: CommandRunner | undefined): boolean {
  // A checkout other than the project root, as for every git call made in one.
  const git = new Git(path, targetGitOptions(runner))
  const answer = git.try.revParse('--is-shallow-repository')
  return answer.ok && answer.value === 'true'
}
