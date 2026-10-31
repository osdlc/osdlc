// Checks the library families' conformance suites, as checks over data that
// the entry point at the bottom reads from disk. The standard is
// docs/planning/standards/S-conformance-suites.md.
//
//   node scripts/conformance.ts               check every family
//   node scripts/conformance.ts --regenerate  also run each generator, then
//                                             fail if a suite changed
//   node scripts/conformance.ts --regenerate --reference ts
//                                             only the families whose
//                                             reference is TypeScript
//
// The checks:
//
//   - packages/conformance/families.json lists each family with its reference,
//     its generator command and its implementations. Each family has a
//     directory holding README.md and suite.json (or one <section>.json per
//     section), and each implementation's directory exists.
//   - Every suite file has the suite format: family, reference,
//     referenceVersion and sections, each case with a name, an input, and
//     exactly one of expect and error.
//   - Each implementation's tests/ names the family's suite path.
//   - The implementations share major.minor, unless the family is in
//     CATCHING_UP below.
//   - Every library whose tests read a suite under packages/conformance/ is
//     listed for that family, and no TypeScript library reads a crate's
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
 * Families whose implementations do not share major.minor yet. Each entry
 * names the work that brings them level, and goes when it lands.
 */
export const CATCHING_UP: Record<string, string> = {
  'tiered-dirs': 'the Rust crate reaches 0.5.0 with the realign-small-twins work',
}

/**
 * Libraries that still read the other language's fixture directly, before
 * their family's suite moves to packages/conformance/. A binding reading the
 * crate it is built from (yaml-splice) is not a family and stays.
 */
export const UNMIGRATED = new Set([
  'packages/ts/frontmatter-lossless',
  'packages/ts/path-guard',
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
    const extra = Object.keys(f).filter((k) => !['reference', 'generator', 'implementations'].includes(k))
    if (extra.length > 0) problems.push(`${name}: unknown keys ${extra.join(', ')}`)
    if (typeof f['generator'] !== 'string' || f['generator'] === '') problems.push(`${name}: no generator command`)
    const impls = f['implementations']
    if (!Array.isArray(impls) || impls.length < 2) {
      problems.push(`${name}: a family has at least two implementations`)
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

/** Problems with the versions of one family's implementations. */
export function versionProblems(family: string, versions: Record<string, string>): string[] {
  const seen = new Set(Object.values(versions).map(majorMinor))
  if (seen.size <= 1) return CATCHING_UP[family] === undefined ? [] : [`${family}: listed in CATCHING_UP but its versions agree; remove it`]
  if (CATCHING_UP[family] !== undefined) return []
  const list = Object.entries(versions).map(([dir, v]) => `${dir} ${v}`)
  return [`${family}: implementations do not share major.minor: ${list.join(', ')}`]
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

  for (const [name, f] of Object.entries(families)) {
    const dir = join(base, name)
    if (!existsSync(join(dir, 'README.md'))) problems.push(`${name}: packages/conformance/${name}/README.md is missing`)
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
    problems.push(...versionProblems(name, versions))
  }

  const listed = new Map<string, Set<string>>()
  for (const [name, f] of Object.entries(families)) {
    for (const i of f.implementations) {
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
 * Runs each family's generator, `reference` limiting them to one language,
 * and reports each suite file a generator changed, added or removed.
 */
function regenerate(root: string, reference: string | undefined): string[] {
  const families = JSON.parse(readFileSync(join(root, 'packages/conformance/families.json'), 'utf8')) as Record<string, Family>
  const problems: string[] = []
  for (const [name, f] of Object.entries(families)) {
    if (reference !== undefined && f.reference !== reference) continue
    const before = suiteFiles(root, name)
    const [cmd, ...args] = f.generator.split(' ')
    const cwd = f.reference === 'rust' ? join(root, 'packages/rust') : root
    console.log(`${name}: ${f.generator}`)
    execFileSync(cmd!, args, { cwd, stdio: 'inherit' })
    const after = suiteFiles(root, name)
    for (const file of new Set([...before.keys(), ...after.keys()])) {
      if (before.get(file) !== after.get(file)) {
        problems.push(`packages/conformance/${name}/${file}: its generator changed it; run \`${f.generator}\` and commit the result`)
      }
    }
  }
  return problems
}

function main(): void {
  const args = process.argv.slice(2)
  const at = args.indexOf('--reference')
  const reference = at === -1 ? undefined : args[at + 1]
  const problems = checkRepo(process.cwd())
  if (problems.length === 0 && args.includes('--regenerate')) problems.push(...regenerate(process.cwd(), reference))
  if (problems.length > 0) {
    for (const p of problems) console.error(`  ${p}`)
    console.error(`\n${problems.length} conformance problem(s)`)
    process.exit(1)
  }
  console.log('conformance suites pass')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
