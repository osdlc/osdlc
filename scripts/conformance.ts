// Checks the library families' conformance suites, as checks over data that
// the entry point at the bottom reads from disk. The standard is
// docs/planning/standards/S-conformance-suites.md.
//
//   node scripts/conformance.ts               check every family
//   node scripts/conformance.ts --regenerate  also build each TypeScript
//                                             reference and what it imports,
//                                             run each generator, then fail
//                                             if a suite changed
//   node scripts/conformance.ts --regenerate --reference ts
//                                             only the families whose
//                                             reference is TypeScript
//   node scripts/conformance.ts --write       only run the generators, as
//                                             --regenerate does, and keep
//                                             what they write. The version
//                                             bumps use it: each suite
//                                             records its reference's
//                                             version, so a bump changes it
//
// The checks:
//
//   - packages/conformance/families.json lists each family with its reference,
//     its generator command and its implementations. Each family has a
//     directory holding README.md and suite.json (or one <section>.json per
//     section), and each implementation's directory exists. A family with one
//     implementation also holds SPEC.md.
//   - Every suite file has the suite format: family, reference,
//     referenceVersion and sections, each case with a name, an input, and
//     exactly one of expect and error.
//   - Each implementation's tests/ names the family's suite path.
//   - The implementations share major.minor once the pending changesets
//     (.changeset/*.md) are applied, unless the family is in CATCHING_UP
//     below; a family level now must stay level. The release pull request
//     applies them, so a family a changeset levels passes on main and on that
//     pull request.
//   - Every library whose tests read a suite under packages/conformance/ is
//     listed for that family, as an implementation or as a reader (a library
//     that only reads the suite), and no TypeScript library reads a crate's
//     fixtures (or a crate a TypeScript library's) unless it is in UNMIGRATED.
//
// Each check returns a list of problems, empty when all is well.
// conformance.test.ts tests them.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { parseToml } from './package-shape-rs.ts'

/**
 * Families whose implementations do not share major.minor yet, and that no
 * pending changeset levels. Each entry names the work that brings them level,
 * and goes when it lands. An entry whose versions agree, now or after the
 * pending changesets, is stale: a family a changeset levels needs no entry.
 */
export const CATCHING_UP: Record<string, string> = {
  'tiered-dirs': 'the Rust crate reaches 0.5.0 with the realign-small-twins work',
  'config-layers': 'the Rust crate gains the project-file migrations and compare-and-swap writes of osdlc#637',
}

/**
 * Libraries that still read the other language's fixture directly, before
 * their family's suite moves to packages/conformance/. A binding reading the
 * crate it is built from (yaml-splice) is not a family and stays.
 */
export const UNMIGRATED = new Set([
  'packages/ts/gfm-table',
  'packages/ts/markdown-link',
  'packages/ts/markdown-render',
  'packages/ts/yaml-splice',
  'packages/rust/markdown-contract',
])

export interface Implementation {
  language: string
  dir: string
  name: string
}

export interface Family {
  reference: string
  generator: string
  implementations: Implementation[]
  /** Libraries that read the suite but are not twins: no version match is asked of them. */
  readers?: Implementation[]
}

const LANGUAGES = ['ts', 'rust']
const CASE_KEYS = ['name', 'input', 'expect', 'error', 'platforms', 'skip', 'tolerance']
const PLATFORMS = ['unix', 'windows']

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Problems with families.json itself, read as `raw`. */
export function registryProblems(raw: unknown): string[] {
  if (!isObject(raw)) return ['families.json is not an object of families']
  const problems: string[] = []
  for (const [name, f] of Object.entries(raw)) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) problems.push(`${name}: a family name is lower-case and dash-separated`)
    if (!isObject(f)) {
      problems.push(`${name}: not an object`)
      continue
    }
    const extra = Object.keys(f).filter((k) => !['reference', 'generator', 'implementations', 'readers'].includes(k))
    if (extra.length > 0) problems.push(`${name}: unknown keys ${extra.join(', ')}`)
    if (typeof f['generator'] !== 'string' || f['generator'] === '') problems.push(`${name}: no generator command`)
    const readers = f['readers']
    if (readers !== undefined) {
      if (!Array.isArray(readers)) problems.push(`${name}: readers is a list`)
      else {
        for (const [n, r] of readers.entries()) {
          if (!isObject(r) || typeof r['dir'] !== 'string' || typeof r['name'] !== 'string' || !LANGUAGES.includes(r['language'] as string)) {
            problems.push(`${name}: reader ${n} needs language, dir and name`)
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
      if (!LANGUAGES.includes(i['language'] as string)) problems.push(`${name}: unknown language ${String(i['language'])}`)
      const want = i['language'] === 'ts' ? 'packages/ts/' : 'packages/rust/'
      if (!i['dir'].startsWith(want)) problems.push(`${name}: ${i['dir']} is not under ${want}`)
    }
    if (new Set(languages).size !== languages.length) problems.push(`${name}: two implementations in one language`)
    if (!languages.includes(f['reference'])) problems.push(`${name}: the reference ${String(f['reference'])} is not one of its implementations`)
    const generator = f['generator']
    if (typeof generator === 'string') {
      const ref = impls.find((i: unknown) => isObject(i) && i['language'] === f['reference']) as Implementation | undefined
      const want =
        f['reference'] === 'ts'
          ? `pnpm --filter ${ref?.name} conformance:write`
          : `cargo run -p ${ref?.name} --example conformance-write`
      if (ref !== undefined && generator !== want) problems.push(`${name}: the generator is \`${want}\``)
    }
  }
  return problems
}

/** Problems with one suite file, `file` naming it in messages. */
export function suiteProblems(file: string, raw: unknown, family: string, reference: string): string[] {
  if (!isObject(raw)) return [`${file}: not a JSON object`]
  const problems: string[] = []
  const extra = Object.keys(raw).filter((k) => !['family', 'reference', 'referenceVersion', 'sections'].includes(k))
  if (extra.length > 0) problems.push(`${file}: unknown keys ${extra.join(', ')}`)
  if (raw['family'] !== family) problems.push(`${file}: family is ${String(raw['family'])}, not ${family}`)
  if (raw['reference'] !== reference) problems.push(`${file}: reference is ${String(raw['reference'])}, not ${reference}`)
  if (typeof raw['referenceVersion'] !== 'string' || !/^\d+\.\d+\.\d+/.test(raw['referenceVersion'])) {
    problems.push(`${file}: referenceVersion is not a version`)
  }
  const sections = raw['sections']
  if (!isObject(sections) || Object.keys(sections).length === 0) return [...problems, `${file}: no sections`]
  for (const [s, section] of Object.entries(sections)) {
    const at = `${file}: ${s}`
    if (!isObject(section)) {
      problems.push(`${at}: not an object`)
      continue
    }
    if (typeof section['description'] !== 'string' || section['description'] === '') problems.push(`${at}: no description`)
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
      const unknown = Object.keys(c).filter((k) => !CASE_KEYS.includes(k))
      if (unknown.length > 0) problems.push(`${where}: unknown keys ${unknown.join(', ')}`)
      if (!('input' in c)) problems.push(`${where}: no input`)
      if (('expect' in c) === ('error' in c)) problems.push(`${where}: give exactly one of expect and error`)
      if ('error' in c) {
        const e = c['error']
        if (!isObject(e) || typeof e['kind'] !== 'string' || e['kind'] === '') problems.push(`${where}: error.kind is not a string`)
        else if (Object.keys(e).some((k) => k !== 'kind' && k !== 'message')) problems.push(`${where}: error has only kind and message`)
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
            if (!LANGUAGES.includes(lang)) problems.push(`${where}: skip names an unknown language ${lang}`)
            if (typeof reason !== 'string' || reason.trim() === '') problems.push(`${where}: a skip for ${lang} needs a reason`)
          }
        }
      }
      if ('tolerance' in c && (typeof c['tolerance'] !== 'number' || !(c['tolerance'] > 0))) {
        problems.push(`${where}: tolerance is a positive number`)
      }
    }
  }
  return problems
}

/** `major.minor` of a version string. */
export function majorMinor(version: string): string {
  return version.split('.').slice(0, 2).join('.')
}

const BUMPS = ['none', 'patch', 'minor', 'major']

/**
 * `version` after a `bump` (none, patch, minor or major) of its release. A major bump
 * of a 0.x version gives 1.0.0, as changesets does. Prerelease versions throw.
 */
export function bumpVersion(version: string, bump: string): string {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`${version}: prerelease versions are not supported by this check`)
  const [major, minor, patch] = version.split('.').map(Number) as [number, number, number]
  if (bump === 'none') return version
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

const FRONTMATTER = /^\s*---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/

const FRONT_LINE = /^(["']?)([^"'\s:]+)\1\s*:\s*(none|patch|minor|major)\s*(?:#.*)?$/

/**
 * The highest bump each package has in the changesets, from `[file, text]` of
 * the .changeset/*.md files: frontmatter lines of `"<package>": none|patch|minor|major`,
 * with an optional trailing `# comment`. A file without frontmatter at its start,
 * or with a frontmatter line that does not parse, throws, naming the file. Valid only while config.json has no fixed or linked
 * groups, no ignore and no pre mode (see {@link configProblems}), so a
 * package's release is its own highest bump.
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
      if (m === null) throw new Error(`${file}: cannot parse the frontmatter line ${JSON.stringify(line)}`)
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
  if (hasPre) out.push('.changeset/pre.json exists (pre mode); the version check does not support it')
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
 * each implementation's version once the pending changesets are applied, where
 * it differs from `versions`; the family must be level now and after them, or
 * be listed in `catchingUp`.
 */
export function versionProblems(
  family: string,
  versions: Record<string, string>,
  released: Record<string, string> = versions,
  catchingUp: Record<string, string> = CATCHING_UP,
): string[] {
  const level = (v: Record<string, string>): boolean => new Set(Object.values(v).map(majorMinor)).size <= 1
  const listed = catchingUp[family] !== undefined
  const moved = Object.keys(versions).filter((d) => released[d] !== versions[d])
  const bumped = moved.map((d) => `${d} ${versions[d]} -> ${released[d]}`).join(', ')
  const show = (v: Record<string, string>): string => Object.entries(v).map(([d, x]) => `${d} ${x}`).join(', ')
  if (level(versions)) {
    if (level(released)) return listed ? [`${family}: listed in CATCHING_UP but its versions agree; remove it`] : []
    if (listed) return []
    return [`${family}: implementations share major.minor now, but the pending changesets would push them apart (${bumped}); level the bumps or add a CATCHING_UP entry`]
  }
  if (level(released)) {
    return listed
      ? [`${family}: listed in CATCHING_UP but the pending changesets level it (${show(released)}); remove it`]
      : []
  }
  if (listed) return []
  const tail = moved.length > 0 ? `, and the pending changesets do not level them (${bumped})` : ''
  return [`${family}: implementations do not share major.minor: ${show(versions)}${tail}`]
}

/**
 * The family each test file's suite path names, by library directory, from
 * `files` (library directory to its test sources).
 */
export function suiteReaders(files: Map<string, string[]>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const [dir, sources] of files) {
    for (const text of sources) {
      for (const m of text.matchAll(/conformance\/([a-z0-9-]+)\/(suite|[a-z0-9_]+)\.json/g)) {
        if (!out.has(dir)) out.set(dir, new Set())
        out.get(dir)!.add(m[1]!)
      }
    }
  }
  return out
}

/** Whether a test source reads the other language's fixtures directly. */
export function readsAcross(dir: string, sources: string[]): boolean {
  const other = dir.startsWith('packages/ts/') ? /rust\/[a-z0-9-]+\/tests\/fixtures\// : /ts\/[a-z0-9-]+\/(corpus|tests\/fixtures|fixtures)\//
  return sources.some((s) => other.test(s))
}

/** The test sources under `dir`/tests (and `dir`/src for a crate's inline tests). */
function testSources(root: string, dir: string): string[] {
  const out: string[] = []
  const walk = (d: string): void => {
    if (!existsSync(d)) return
    for (const n of readdirSync(d)) {
      if (n === 'node_modules' || n === 'target' || n === 'dist') continue
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(ts|mts|mjs|rs)$/.test(n)) out.push(readFileSync(p, 'utf8'))
    }
  }
  walk(join(root, dir, 'tests'))
  return out
}

function versionOf(root: string, impl: Implementation): string | null {
  if (impl.language === 'ts') {
    const file = join(root, impl.dir, 'package.json')
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { version: string }).version : null
  }
  const file = join(root, impl.dir, 'Cargo.toml')
  if (!existsSync(file)) return null
  const pkg = parseToml(readFileSync(file, 'utf8'))['package']
  return isObject(pkg) && typeof pkg['version'] === 'string' ? pkg['version'] : null
}

/** Every problem in the repository at `root`. */
export function checkRepo(root: string): string[] {
  const base = join(root, 'packages/conformance')
  const registryFile = join(base, 'families.json')
  if (!existsSync(registryFile)) return ['packages/conformance/families.json is missing']
  const raw = JSON.parse(readFileSync(registryFile, 'utf8')) as unknown
  const problems = registryProblems(raw)
  if (problems.length > 0) return problems
  const families = raw as Record<string, Family>
  const changesetDir = join(root, '.changeset')
  const configFile = join(changesetDir, 'config.json')
  const configProblem = configProblems(
    existsSync(configFile) ? (JSON.parse(readFileSync(configFile, 'utf8')) as unknown) : null,
    existsSync(join(changesetDir, 'pre.json')),
  )
  if (configProblem.length > 0) return configProblem
  let bumps: Map<string, string>
  try {
    bumps = pendingBumps(
      existsSync(changesetDir)
        ? readdirSync(changesetDir)
            .filter((n) => n.endsWith('.md') && n !== 'README.md')
            .map((n): [string, string] => [`.changeset/${n}`, readFileSync(join(changesetDir, n), 'utf8')])
        : [],
    )
  } catch (e) {
    return [(e as Error).message]
  }

  for (const [name, f] of Object.entries(families)) {
    const dir = join(base, name)
    if (!existsSync(join(dir, 'README.md'))) problems.push(`${name}: packages/conformance/${name}/README.md is missing`)
    if (f.implementations.length === 1 && !existsSync(join(dir, 'SPEC.md'))) {
      problems.push(`${name}: a family with one implementation states its format in packages/conformance/${name}/SPEC.md`)
    }
    const suites = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.json')) : []
    if (suites.length === 0) problems.push(`${name}: no suite file in packages/conformance/${name}/`)
    if (suites.includes('suite.json') && suites.length > 1) problems.push(`${name}: suite.json and section files are not mixed`)
    for (const s of suites) {
      const file = `packages/conformance/${name}/${s}`
      let json: unknown
      try {
        json = JSON.parse(readFileSync(join(dir, s), 'utf8'))
      } catch (err) {
        problems.push(`${file}: ${(err as Error).message}`)
        continue
      }
      problems.push(...suiteProblems(file, json, name, f.reference))
    }
    const versions: Record<string, string> = {}
    for (const impl of f.implementations) {
      if (!existsSync(join(root, impl.dir))) {
        problems.push(`${name}: ${impl.dir} does not exist`)
        continue
      }
      const v = versionOf(root, impl)
      if (v === null) problems.push(`${name}: cannot read the version of ${impl.dir}`)
      else versions[impl.dir] = v
      const named = suiteReaders(new Map([[impl.dir, testSources(root, impl.dir)]])).get(impl.dir)
      if (named?.has(name) !== true) problems.push(`${name}: no test under ${impl.dir}/tests names packages/conformance/${name}/`)
    }
    try {
      const released = Object.fromEntries(
        f.implementations.flatMap((i) => {
          const v = versions[i.dir]
          const bump = i.language === 'ts' ? bumps.get(i.name) : undefined
          return v === undefined ? [] : [[i.dir, bump === undefined ? v : bumpVersion(v, bump)]]
        }),
      )
      problems.push(...versionProblems(name, versions, released))
    } catch (e) {
      problems.push(`${name}: ${(e as Error).message}`)
    }
  }

  const listed = new Map<string, Set<string>>()
  for (const [name, f] of Object.entries(families)) {
    for (const i of [...f.implementations, ...(f.readers ?? [])]) {
      if (!listed.has(i.dir)) listed.set(i.dir, new Set())
      listed.get(i.dir)!.add(name)
    }
  }
  const libraries = ['packages/ts', 'packages/rust'].flatMap((d) =>
    existsSync(join(root, d))
      ? readdirSync(join(root, d))
          .filter((n) => statSync(join(root, d, n)).isDirectory())
          .map((n) => `${d}/${n}`)
      : [],
  )
  const sources = new Map(libraries.map((d) => [d, testSources(root, d)]))
  for (const [dir, named] of suiteReaders(sources)) {
    for (const family of named) {
      if (listed.get(dir)?.has(family) !== true) problems.push(`${dir}: reads the ${family} suite but families.json does not list it`)
    }
  }
  for (const [dir, s] of sources) {
    const across = readsAcross(dir, s)
    if (across && !UNMIGRATED.has(dir)) problems.push(`${dir}: reads the other language's fixtures; move them to a suite in packages/conformance/`)
    if (!across && UNMIGRATED.has(dir)) problems.push(`${dir}: listed in UNMIGRATED but reads no other language's fixtures; remove it`)
  }
  return problems
}

/** The suite files of `family`, by name, with their contents. */
function suiteFiles(root: string, family: string): Map<string, string> {
  const dir = join(root, 'packages/conformance', family)
  const out = new Map<string, string>()
  if (!existsSync(dir)) return out
  for (const n of readdirSync(dir).filter((n) => n.endsWith('.json'))) out.set(n, readFileSync(join(dir, n), 'utf8'))
  return out
}

/**
 * The pnpm `--filter` flags that pick each TypeScript reference and the
 * workspace libraries it depends on, `reference` limiting the families to one
 * language. A generator runs its package's sources, which import other
 * workspace libraries through their dist/, so these are built first. Cargo
 * builds a Rust reference's dependencies itself.
 */
export function generatorBuildFilters(families: Record<string, Family>, reference: string | undefined): string[] {
  const filters: string[] = []
  for (const f of Object.values(families)) {
    if (f.reference !== 'ts' || (reference !== undefined && f.reference !== reference)) continue
    const ts = f.implementations.find((i) => i.language === 'ts')
    if (ts !== undefined) filters.push('--filter', `${ts.name}...`)
  }
  return filters
}

/** A suite file a generator changed, added or removed, and the generator that did. */
interface Regenerated {
  file: string
  generator: string
}

/**
 * Builds what the generators import, runs each family's generator,
 * `reference` limiting them to one language, and returns each suite file a
 * generator changed, added or removed. The new files stay on disk.
 */
function regenerate(root: string, reference: string | undefined): Regenerated[] {
  const families = JSON.parse(readFileSync(join(root, 'packages/conformance/families.json'), 'utf8')) as Record<string, Family>
  const filters = generatorBuildFilters(families, reference)
  if (filters.length > 0) {
    const build = [...filters, '--if-present', 'run', 'build']
    console.log(`pnpm ${build.join(' ')}`)
    execFileSync('pnpm', build, { cwd: root, stdio: 'inherit' })
  }
  const changed: Regenerated[] = []
  for (const [name, f] of Object.entries(families)) {
    if (reference !== undefined && f.reference !== reference) continue
    const before = suiteFiles(root, name)
    const [cmd, ...args] = f.generator.split(' ')
    const cwd = f.reference === 'rust' ? join(root, 'packages/rust') : root
    console.log(`${name}: ${f.generator}`)
    execFileSync(cmd!, args, { cwd, stdio: 'inherit' })
    const after = suiteFiles(root, name)
    for (const file of new Set([...before.keys(), ...after.keys()])) {
      if (before.get(file) !== after.get(file)) changed.push({ file: `packages/conformance/${name}/${file}`, generator: f.generator })
    }
  }
  return changed
}

function main(): void {
  const args = process.argv.slice(2)
  const at = args.indexOf('--reference')
  const reference = at === -1 ? undefined : args[at + 1]
  // No checks first: a version bump writes the suites even when a check
  // fails, and the pull request it opens fails CI there instead.
  if (args.includes('--write')) {
    for (const c of regenerate(process.cwd(), reference)) console.log(`rewrote ${c.file}`)
    return
  }
  const problems = checkRepo(process.cwd())
  if (problems.length === 0 && args.includes('--regenerate')) {
    for (const c of regenerate(process.cwd(), reference)) {
      problems.push(`${c.file}: its generator changed it; run \`${c.generator}\` and commit the result`)
    }
  }
  if (problems.length > 0) {
    for (const p of problems) console.error(`  ${p}`)
    console.error(`\n${problems.length} conformance problem(s)`)
    process.exit(1)
  }
  console.log('conformance suites pass')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
