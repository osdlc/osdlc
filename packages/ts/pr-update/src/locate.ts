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
 * A host that supplies its own `Ports` supplies its own `locate`, and this
 * module is not used.
 */

import type { CommandRunner } from '@osdlc/command-seam'
import { CheckoutLocator, type LocateOptions } from '@osdlc/ecosystem/repositories'
import { Git } from '@osdlc/typed-git'

import type { FoundCheckout, LocateTarget } from './ports.ts'

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
}

/**
 * A `Ports.locate` over one {@link CheckoutLocator}, made on the first call so
 * a run with no `--repo` reads no file and scans nothing. Each target is
 * resolved once, and its notes printed once.
 *
 * Every match resolves to its main checkout. With more than one, the first by
 * path serves the run and the note names the others.
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
    const usable = matches.filter((m) => {
      const shallow = isShallow(m.path, opts.git)
      if (shallow) notice(`${label}: skipped ${m.path}: a shallow checkout cannot measure drift`)
      return !shallow
    })
    const [first, ...others] = usable
    if (first === undefined) {
      notice(notFound(label, locator))
      return null
    }
    if (others.length > 0) {
      notice(
        `${label}: using ${first.path}; also checked out at ${others.map((o) => o.path).join(', ')}`,
      )
    }
    return { path: first.path, source: 'located', remote: 'origin' }
  }

  return (repo, target) => {
    const key = target === undefined ? repo : `${target.host}/${repo}`
    if (!resolved.has(key)) resolved.set(key, find(repo, target))
    return resolved.get(key) ?? null
  }
}

/** The note for a target with no usable checkout: where the search looked, and where that is set. */
function notFound(label: string, locator: CheckoutLocator): string {
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
  return `${label}: ${where} (${from})${deeper}`
}

/** Whether the checkout at `path` is shallow. Unknown counts as not shallow: the measure then says what it can. */
function isShallow(path: string, runner: CommandRunner | undefined): boolean {
  const git = new Git(path, runner === undefined ? {} : { runner })
  const answer = git.try.revParse('--is-shallow-repository')
  return answer.ok && answer.value === 'true'
}
