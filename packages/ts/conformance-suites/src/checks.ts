/**
 * The conformance checks, as functions over data. Each returns a list of
 * problems, empty when all is well. `repo.ts` reads the data from disk.
 */

/** One library in a family. */
export interface Implementation {
  language: string
  dir: string
  name: string
}

/** One entry of families.json. */
export interface Family {
  reference: string
  generator: string
  implementations: Implementation[]
  /** Libraries that read the suite but are not twins: no version match is asked of them. */
  readers?: Implementation[]
}

/** The languages a family may be written in. */
export const LANGUAGES = ['ts', 'rust'] as const

/** Where each language's libraries live, relative to the repository root. */
export type LibraryRoots = Record<string, string>

/** The layout osdlc/osdlc and osdlc/markdown use. */
export const DEFAULT_LIBRARY_ROOTS: LibraryRoots = { ts: 'packages/ts', rust: 'packages/rust' }

const CASE_KEYS = ['name', 'input', 'expect', 'error', 'platforms', 'skip', 'tolerance']
const PLATFORMS = ['unix', 'windows']

/** A plain object: not null and not an array. */
export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** The generator command S-conformance-suites fixes for a reference. */
export function generatorCommand(reference: string, name: string): string {
  return reference === 'ts'
    ? `pnpm --filter ${name} conformance:write`
    : `cargo run -p ${name} --example conformance-write`
}

/** Problems with families.json itself, read as `raw`. */
export function registryProblems(
  raw: unknown,
  roots: LibraryRoots = DEFAULT_LIBRARY_ROOTS,
): string[] {
  if (!isObject(raw)) return ['families.json is not an object of families']
  const problems: string[] = []
  for (const [name, f] of Object.entries(raw)) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
      problems.push(`${name}: a family name is lower-case and dash-separated`)
    }
    if (!isObject(f)) {
      problems.push(`${name}: not an object`)
      continue
    }
    const extra = Object.keys(f).filter(
      (k) => !['reference', 'generator', 'implementations', 'readers'].includes(k),
    )
    if (extra.length > 0) problems.push(`${name}: unknown keys ${extra.join(', ')}`)
    if (typeof f['generator'] !== 'string' || f['generator'] === '')
      problems.push(`${name}: no generator command`)
    const readers = f['readers']
    if (readers !== undefined) {
      if (!Array.isArray(readers)) problems.push(`${name}: readers is a list`)
      else {
        const implementationDirs = new Set(
          Array.isArray(f['implementations'])
            ? f['implementations'].map((i: unknown) => (isObject(i) ? i['dir'] : undefined))
            : [],
        )
        const seenDirs = new Set<unknown>()
        const seenNames = new Set<unknown>()
        for (const [n, r] of readers.entries()) {
          if (isObject(r)) {
            if (typeof r['dir'] === 'string') {
              if (seenDirs.has(r['dir']))
                problems.push(`${name}: reader ${r['dir']} is listed twice`)
              else if (implementationDirs.has(r['dir']))
                problems.push(`${name}: ${r['dir']} is both an implementation and a reader`)
              seenDirs.add(r['dir'])
            }
            if (typeof r['name'] === 'string') {
              if (seenNames.has(r['name']))
                problems.push(`${name}: reader name ${r['name']} is listed twice`)
              seenNames.add(r['name'])
            }
          }
          const language = isObject(r) ? r['language'] : undefined
          if (
            !isObject(r) ||
            typeof r['dir'] !== 'string' ||
            typeof r['name'] !== 'string' ||
            typeof language !== 'string' ||
            !(LANGUAGES as readonly string[]).includes(language)
          ) {
            problems.push(`${name}: reader ${n} needs language, dir and name`)
          } else if (!r['dir'].startsWith(`${roots[language]}/`)) {
            problems.push(`${name}: reader ${r['dir']} is not under ${roots[language]}/`)
          }
        }
      }
    }
    const impls = f['implementations']
    if (!Array.isArray(impls) || impls.length === 0) {
      problems.push(`${name}: a family has at least one implementation`)
      continue
    }
    const languages = impls.map((i: unknown) => (isObject(i) ? i['language'] : undefined))
    for (const [n, i] of impls.entries()) {
      if (!isObject(i) || typeof i['dir'] !== 'string' || typeof i['name'] !== 'string') {
        problems.push(`${name}: implementation ${n} needs language, dir and name`)
        continue
      }
      const language = i['language']
      if (typeof language !== 'string' || !(LANGUAGES as readonly string[]).includes(language)) {
        problems.push(`${name}: unknown language ${String(language)}`)
        continue
      }
      const want = `${roots[language]}/`
      if (!i['dir'].startsWith(want)) problems.push(`${name}: ${i['dir']} is not under ${want}`)
    }
    if (new Set(languages).size !== languages.length)
      problems.push(`${name}: two implementations in one language`)
    if (!languages.includes(f['reference'])) {
      problems.push(
        `${name}: the reference ${String(f['reference'])} is not one of its implementations`,
      )
    }
    const generator = f['generator']
    const ref = impls.find((i: unknown) => isObject(i) && i['language'] === f['reference']) as
      Implementation | undefined
    if (typeof generator === 'string' && ref !== undefined) {
      const want = generatorCommand(ref.language, ref.name)
      if (generator !== want) problems.push(`${name}: the generator is \`${want}\``)
    }
  }
  return problems
}

/** Problems with one suite file, `file` naming it in messages. */
export function suiteProblems(
  file: string,
  raw: unknown,
  family: string,
  reference: string,
): string[] {
  if (!isObject(raw)) return [`${file}: not a JSON object`]
  const problems: string[] = []
  const extra = Object.keys(raw).filter(
    (k) => !['family', 'reference', 'referenceVersion', 'sections'].includes(k),
  )
  if (extra.length > 0) problems.push(`${file}: unknown keys ${extra.join(', ')}`)
  if (raw['family'] !== family)
    problems.push(`${file}: family is ${String(raw['family'])}, not ${family}`)
  if (raw['reference'] !== reference)
    problems.push(`${file}: reference is ${String(raw['reference'])}, not ${reference}`)
  if (
    typeof raw['referenceVersion'] !== 'string' ||
    !/^\d+\.\d+\.\d+/.test(raw['referenceVersion'])
  ) {
    problems.push(`${file}: referenceVersion is not a version`)
  }
  const sections = raw['sections']
  if (!isObject(sections) || Object.keys(sections).length === 0)
    return [...problems, `${file}: no sections`]
  for (const [s, section] of Object.entries(sections)) {
    const at = `${file}: ${s}`
    if (!isObject(section)) {
      problems.push(`${at}: not an object`)
      continue
    }
    if (typeof section['description'] !== 'string' || section['description'] === '') {
      problems.push(`${at}: no description`)
    }
    const cases = section['cases']
    if (!Array.isArray(cases) || cases.length === 0) {
      problems.push(`${at}: no cases`)
      continue
    }
    const names = new Set<string>()
    for (const [n, c] of cases.entries()) {
      if (!isObject(c)) {
        problems.push(`${at}: case ${n} is not an object`)
        continue
      }
      const name = typeof c['name'] === 'string' && c['name'] !== '' ? c['name'] : null
      const where = `${at}: ${name ?? `case ${n}`}`
      if (name === null) problems.push(`${where}: no name`)
      else if (names.has(name)) problems.push(`${where}: two cases have this name`)
      else names.add(name)
      problems.push(...caseProblems(where, c))
    }
  }
  return problems
}

/** Problems with one case's keys, `where` naming it. */
function caseProblems(where: string, c: Record<string, unknown>): string[] {
  const problems: string[] = []
  const unknown = Object.keys(c).filter((k) => !CASE_KEYS.includes(k))
  if (unknown.length > 0) problems.push(`${where}: unknown keys ${unknown.join(', ')}`)
  if (!('input' in c)) problems.push(`${where}: no input`)
  if ('expect' in c === 'error' in c)
    problems.push(`${where}: give exactly one of expect and error`)
  if ('error' in c) {
    const e = c['error']
    if (!isObject(e) || typeof e['kind'] !== 'string' || e['kind'] === '') {
      problems.push(`${where}: error.kind is not a string`)
    } else if (Object.keys(e).some((k) => k !== 'kind' && k !== 'message')) {
      problems.push(`${where}: error has only kind and message`)
    }
  }
  if ('platforms' in c) {
    const p = c['platforms']
    if (!Array.isArray(p) || p.length === 0 || p.some((x) => !PLATFORMS.includes(x as string))) {
      problems.push(`${where}: platforms is a non-empty list of ${PLATFORMS.join(', ')}`)
    }
  }
  if ('skip' in c) {
    const skip = c['skip']
    if (!isObject(skip)) problems.push(`${where}: skip maps a language to a reason`)
    else {
      for (const [lang, reason] of Object.entries(skip)) {
        if (!(LANGUAGES as readonly string[]).includes(lang)) {
          problems.push(`${where}: skip names an unknown language ${lang}`)
        }
        if (typeof reason !== 'string' || reason.trim() === '') {
          problems.push(`${where}: a skip for ${lang} needs a reason`)
        }
      }
    }
  }
  if ('tolerance' in c && (typeof c['tolerance'] !== 'number' || !(c['tolerance'] > 0))) {
    problems.push(`${where}: tolerance is a positive number`)
  }
  return problems
}

/** `major.minor` of a version string. */
export function majorMinor(version: string): string {
  return version.split('.').slice(0, 2).join('.')
}

/**
 * The version of a package that was never released. Its first release takes
 * the family's major.minor (a `minor` changeset from 0.0.0 gives 0.1.0), so
 * until then it is not compared.
 */
const UNRELEASED = '0.0.0'

const BUMPS = ['none', 'patch', 'minor', 'major']

/**
 * `version` after a `bump` (none, patch, minor or major) of its release. A
 * major bump of a 0.x version gives 1.0.0, as Changesets does. A prerelease
 * version throws.
 */
export function bumpVersion(version: string, bump: string): string {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`${version}: prerelease versions are not supported by this check`)
  }
  const [major, minor, patch] = version.split('.').map(Number) as [number, number, number]
  if (bump === 'none') return version
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

const FRONTMATTER = /^\s*---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/

const FRONT_LINE = /^(["']?)([^"'\s:]+)\1\s*:\s*(none|patch|minor|major)\s*(?:#.*)?$/

/**
 * The highest bump each package has in the changesets, from `[file, text]`
 * of the .changeset/*.md files: frontmatter lines of
 * `"<package>": none|patch|minor|major`, with an optional trailing
 * `# comment`. A file without frontmatter at its start, or with a frontmatter
 * line that does not parse, throws, naming the file. Valid only while
 * config.json has no fixed or linked groups, no ignore and no pre mode (see
 * {@link configProblems}), so a package's release is its own highest bump.
 */
export function pendingBumps(changesets: Array<[string, string]>): Map<string, string> {
  const out = new Map<string, string>()
  for (const [file, text] of changesets) {
    const m0 = FRONTMATTER.exec(text)
    if (m0 === null) throw new Error(`${file}: no frontmatter at the start of the file`)
    for (const raw of (m0[1] ?? '').split(/\r?\n/)) {
      const line = raw.trim()
      if (line === '' || line.startsWith('#')) continue
      const m = FRONT_LINE.exec(line)
      if (m === null)
        throw new Error(`${file}: cannot parse the frontmatter line ${JSON.stringify(line)}`)
      const [, , name, bump] = m as unknown as [string, string, string, string]
      const have = out.get(name)
      if (have === undefined || BUMPS.indexOf(bump) > BUMPS.indexOf(have)) out.set(name, bump)
    }
  }
  return out
}

/** Problems with .changeset/config.json (or pre.json) that pendingBumps does not model. */
export function configProblems(config: unknown, hasPre: boolean): string[] {
  const out: string[] = []
  if (hasPre)
    out.push('.changeset/pre.json exists (pre mode); the version check does not support it')
  if (isObject(config)) {
    for (const key of ['fixed', 'linked', 'ignore']) {
      const v = config[key]
      if (Array.isArray(v) ? v.length > 0 : v !== undefined) {
        out.push(`.changeset/config.json sets ${key}; the version check does not support it`)
      }
    }
  }
  return out
}

/**
 * Problems with the versions of one family's implementations. `released` is
 * each implementation's version once the pending changesets are applied,
 * where it differs from `versions`. The family must be level now and after
 * them, or be listed in `catchingUp`. One at 0.0.0 was never released and is
 * not compared.
 */
export function versionProblems(
  family: string,
  versions: Record<string, string>,
  released: Record<string, string> = versions,
  catchingUp: Record<string, string> = {},
): string[] {
  const level = (v: Record<string, string>): boolean =>
    new Set(Object.values(v).filter((x) => x !== UNRELEASED).map(majorMinor)).size <= 1
  const listed = catchingUp[family] !== undefined
  const moved = Object.keys(versions).filter((d) => released[d] !== versions[d])
  const bumped = moved.map((d) => `${d} ${versions[d]} -> ${released[d]}`).join(', ')
  const show = (v: Record<string, string>): string =>
    Object.entries(v)
      .map(([d, x]) => `${d} ${x}`)
      .join(', ')
  if (level(versions)) {
    if (level(released))
      return listed ? [`${family}: listed in catchingUp but its versions agree; remove it`] : []
    if (listed) return []
    return [
      `${family}: implementations share major.minor now, but the pending changesets would push them apart (${bumped}); level the bumps or add a catchingUp entry`,
    ]
  }
  if (level(released)) {
    return listed
      ? [
          `${family}: listed in catchingUp but the pending changesets level it (${show(released)}); remove it`,
        ]
      : []
  }
  if (listed) return []
  const tail = moved.length > 0 ? `, and the pending changesets do not level them (${bumped})` : ''
  return [`${family}: implementations do not share major.minor: ${show(versions)}${tail}`]
}

/** `s` with every regular-expression metacharacter escaped. */
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The family each test file's suite path names, by library directory, from
 * `files` (library directory to its test sources). `suites` is the name of
 * the directory that holds the families, `conformance` by default.
 */
export function suiteReaders(
  files: Map<string, string[]>,
  suites = 'conformance',
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const path = new RegExp(`${escapeRegExp(suites)}\\/([a-z0-9-]+)\\/(suite|[a-z0-9_]+)\\.json`, 'g')
  for (const [dir, sources] of files) {
    for (const text of sources) {
      for (const m of text.matchAll(path)) {
        if (!out.has(dir)) out.set(dir, new Set())
        out.get(dir)!.add(m[1]!)
      }
    }
  }
  return out
}

/**
 * Whether a test source in `dir` reads the other language's fixtures
 * directly: a TypeScript library reading `rust/<crate>/tests/fixtures/`, or
 * a crate reading a TypeScript library's `corpus/`, `tests/fixtures/` or
 * `fixtures/`.
 */
export function readsAcross(
  dir: string,
  sources: string[],
  roots: LibraryRoots = DEFAULT_LIBRARY_ROOTS,
): boolean {
  const tail = (root: string | undefined): string =>
    escapeRegExp((root ?? '').split('/').pop() ?? '')
  const other = dir.startsWith(`${roots['ts']}/`)
    ? new RegExp(`${tail(roots['rust'])}\\/[a-z0-9-]+\\/tests\\/fixtures\\/`)
    : new RegExp(`${tail(roots['ts'])}\\/[a-z0-9-]+\\/(corpus|tests\\/fixtures|fixtures)\\/`)
  return sources.some((s) => other.test(s))
}

/**
 * The pnpm `--filter` flags that pick each TypeScript reference and the
 * workspace libraries it depends on, `reference` limiting the families to
 * one language. A generator runs its package's sources, which import other
 * workspace libraries through their dist/, so these are built first. Cargo
 * builds a Rust reference's dependencies itself.
 */
export function generatorBuildFilters(
  families: Record<string, Family>,
  reference: string | undefined,
): string[] {
  const filters: string[] = []
  for (const f of Object.values(families)) {
    if (f.reference !== 'ts' || (reference !== undefined && f.reference !== reference)) continue
    const ts = f.implementations.find((i) => i.language === 'ts')
    if (ts !== undefined) filters.push('--filter', `${ts.name}...`)
  }
  return filters
}
