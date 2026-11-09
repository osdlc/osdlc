/**
 * The repository's conformance settings: `config.json` beside families.json.
 * Every key is optional.
 */

import { DEFAULT_LIBRARY_ROOTS, isObject, type LibraryRoots } from './checks.ts'

/** The settings, with defaults filled in. */
export interface ConformanceConfig {
  /** Where each language's libraries live: `{ "ts": "packages/ts", "rust": "packages/rust" }`. */
  libraries: LibraryRoots
  /**
   * Families whose implementations do not share major.minor yet, and that no
   * pending changeset levels, each with the work that brings them level. An
   * entry whose versions agree, now or after the pending changesets, is
   * stale and fails the check.
   */
  catchingUp: Record<string, string>
  /**
   * Libraries whose tests still read the other language's fixtures directly,
   * before their family's suite moves. An entry that reads none fails the check.
   */
  unmigrated: string[]
  /**
   * Libraries whose test sources are not scanned for suite paths and fixture
   * reads, each with the reason, such as a checker whose tests hold suite
   * paths as data.
   */
  skipScan: Record<string, string>
}

const KEYS = ['libraries', 'catchingUp', 'unmigrated', 'skipScan']

const isStringMap = (v: unknown): v is Record<string, string> =>
  isObject(v) && Object.values(v).every((x) => typeof x === 'string' && x.trim() !== '')

/**
 * The settings in `raw` (the parsed config.json, or undefined when there is
 * none) with defaults filled in, or the problems with it.
 */
export function readConfig(raw: unknown): { config: ConformanceConfig } | { problems: string[] } {
  const config: ConformanceConfig = {
    libraries: { ...DEFAULT_LIBRARY_ROOTS },
    catchingUp: {},
    unmigrated: [],
    skipScan: {},
  }
  if (raw === undefined) return { config }
  if (!isObject(raw)) return { problems: ['config.json is not an object'] }
  const problems: string[] = []
  const extra = Object.keys(raw).filter((k) => !KEYS.includes(k))
  if (extra.length > 0) problems.push(`config.json: unknown keys ${extra.join(', ')}`)
  const { libraries, catchingUp, unmigrated, skipScan } = raw
  if (libraries !== undefined) {
    if (!isStringMap(libraries) || Object.keys(libraries).some((k) => k !== 'ts' && k !== 'rust')) {
      problems.push('config.json: libraries maps ts and rust to a directory')
    } else {
      for (const [language, dir] of Object.entries(libraries))
        config.libraries[language] = dir.replace(/\/+$/, '')
      // A library's language is the root it is under, so neither root may hold the other.
      const [ts, rust] = [config.libraries['ts']!, config.libraries['rust']!]
      if (ts === rust || ts.startsWith(`${rust}/`) || rust.startsWith(`${ts}/`))
        problems.push('config.json: libraries.ts and libraries.rust are separate directories')
      // A test names the other language's libraries by the root's last folder.
      else if (ts.split('/').pop() === rust.split('/').pop())
        problems.push('config.json: libraries.ts and libraries.rust end in different folder names')
    }
  }
  if (catchingUp !== undefined) {
    if (!isStringMap(catchingUp))
      problems.push('config.json: catchingUp maps a family to the work that levels it')
    else config.catchingUp = catchingUp
  }
  if (unmigrated !== undefined) {
    if (!Array.isArray(unmigrated) || unmigrated.some((d) => typeof d !== 'string')) {
      problems.push('config.json: unmigrated is a list of library directories')
    } else config.unmigrated = unmigrated
  }
  if (skipScan !== undefined) {
    if (!isStringMap(skipScan))
      problems.push('config.json: skipScan maps a library directory to a reason')
    else config.skipScan = skipScan
  }
  return problems.length > 0 ? { problems } : { config }
}
