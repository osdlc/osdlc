/**
 * Reads a repository from disk and runs the checks in `checks.ts` on it, and
 * runs the suites' generators. The standard is S-conformance-suites in
 * osdlc/osdlc.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'

import { streamRunner } from '@osdlc/command-seam'
import { parse as parseToml } from 'smol-toml'

import {
  bumpVersion,
  configProblems,
  generatorBuildFilters,
  isObject,
  pendingBumps,
  readsAcross,
  registryProblems,
  suiteProblems,
  suiteReaders,
  versionProblems,
  type Family,
  type Implementation,
} from './checks.ts'
import { readConfig, type ConformanceConfig } from './config.ts'

/** Where the registry is, relative to the repository root, unless a caller names another. */
export const DEFAULT_FAMILIES = 'packages/conformance/families.json'

/** Where to look. */
export interface RepoOptions {
  /** The families file, relative to the root. Its directory holds the suites and config.json. */
  families?: string | undefined
}

/** The suites directory relative to the root, with `/`. */
function suitesDir(options: RepoOptions): string {
  return dirname(options.families ?? DEFAULT_FAMILIES).replaceAll('\\', '/')
}

/** The settings, or the problems with config.json. */
function loadConfig(
  root: string,
  options: RepoOptions,
): { config: ConformanceConfig } | { problems: string[] } {
  const file = join(root, suitesDir(options), 'config.json')
  if (!existsSync(file)) return readConfig(undefined)
  try {
    return readConfig(JSON.parse(readFileSync(file, 'utf8')))
  } catch (e) {
    return { problems: [`config.json: ${(e as Error).message}`] }
  }
}

/** The test sources under `dir`/tests. */
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
    return existsSync(file)
      ? (JSON.parse(readFileSync(file, 'utf8')) as { version: string }).version
      : null
  }
  const file = join(root, impl.dir, 'Cargo.toml')
  if (!existsSync(file)) return null
  const pkg = parseToml(readFileSync(file, 'utf8'))['package']
  return isObject(pkg) && typeof pkg['version'] === 'string' ? pkg['version'] : null
}

/** The pending changeset bumps, by package name. Throws on a changeset it cannot read. */
function changesetBumps(root: string): Map<string, string> {
  const dir = join(root, '.changeset')
  if (!existsSync(dir)) return new Map()
  return pendingBumps(
    readdirSync(dir)
      .filter((n) => n.endsWith('.md') && n !== 'README.md')
      .map((n): [string, string] => [`.changeset/${n}`, readFileSync(join(dir, n), 'utf8')]),
  )
}

/** Every problem in the repository at `root`. */
export function checkRepo(root: string, options: RepoOptions = {}): string[] {
  const suites = suitesDir(options)
  const registryFile = join(root, options.families ?? DEFAULT_FAMILIES)
  if (!existsSync(registryFile)) return [`${options.families ?? DEFAULT_FAMILIES} is missing`]
  const loaded = loadConfig(root, options)
  if ('problems' in loaded) return loaded.problems
  const { config } = loaded
  const raw = JSON.parse(readFileSync(registryFile, 'utf8')) as unknown
  const problems = registryProblems(raw, config.libraries)
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
    bumps = changesetBumps(root)
  } catch (e) {
    return [(e as Error).message]
  }

  for (const [name, f] of Object.entries(families)) {
    problems.push(...familyProblems(root, suites, name, f, bumps, config))
  }
  for (const family of Object.keys(config.catchingUp)) {
    if (families[family] === undefined)
      problems.push(`config.json: catchingUp names ${family}, which families.json does not list`)
  }

  const listed = new Map<string, Set<string>>()
  for (const [name, f] of Object.entries(families)) {
    for (const i of [...f.implementations, ...(f.readers ?? [])]) {
      if (!listed.has(i.dir)) listed.set(i.dir, new Set())
      listed.get(i.dir)!.add(name)
    }
  }
  const libraries = Object.values(config.libraries).flatMap((d) =>
    existsSync(join(root, d))
      ? readdirSync(join(root, d))
          .filter((n) => statSync(join(root, d, n)).isDirectory())
          .map((n) => `${d}/${n}`)
      : [],
  )
  for (const dir of Object.keys(config.skipScan)) {
    if (!libraries.includes(dir))
      problems.push(`config.json: skipScan names ${dir}, which is not a library`)
  }
  for (const dir of config.unmigrated) {
    if (!libraries.includes(dir))
      problems.push(`config.json: unmigrated names ${dir}, which is not a library`)
  }
  const sources = new Map(
    libraries.filter((d) => config.skipScan[d] === undefined).map((d) => [d, testSources(root, d)]),
  )
  for (const [dir, named] of suiteReaders(sources, basename(suites))) {
    for (const family of named) {
      if (listed.get(dir)?.has(family) !== true) {
        problems.push(`${dir}: reads the ${family} suite but families.json does not list it`)
      }
    }
  }
  const unmigrated = new Set(config.unmigrated)
  for (const [dir, s] of sources) {
    const across = readsAcross(dir, s, config.libraries)
    if (across && !unmigrated.has(dir)) {
      problems.push(
        `${dir}: reads the other language's fixtures; move them to a suite in ${suites}/`,
      )
    }
    if (!across && unmigrated.has(dir)) {
      problems.push(
        `${dir}: listed in unmigrated but reads no other language's fixtures; remove it`,
      )
    }
  }
  return problems
}

/** The problems with one family: its files, its implementations and their versions. */
function familyProblems(
  root: string,
  suites: string,
  name: string,
  f: Family,
  bumps: Map<string, string>,
  config: ConformanceConfig,
): string[] {
  const problems: string[] = []
  const dir = join(root, suites, name)
  if (!existsSync(join(dir, 'README.md')))
    problems.push(`${name}: ${suites}/${name}/README.md is missing`)
  if (f.implementations.length === 1 && !existsSync(join(dir, 'SPEC.md'))) {
    problems.push(
      `${name}: a family with one implementation states its format in ${suites}/${name}/SPEC.md`,
    )
  }
  const files = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.json')) : []
  if (files.length === 0) problems.push(`${name}: no suite file in ${suites}/${name}/`)
  if (files.includes('suite.json') && files.length > 1)
    problems.push(`${name}: suite.json and section files are not mixed`)
  for (const s of files) {
    const file = `${suites}/${name}/${s}`
    let json: unknown
    try {
      json = JSON.parse(readFileSync(join(dir, s), 'utf8'))
    } catch (err) {
      problems.push(`${file}: ${(err as Error).message}`)
      continue
    }
    problems.push(...suiteProblems(file, json, name, f.reference))
  }
  for (const r of f.readers ?? []) {
    if (f.implementations.some((i) => i.dir === r.dir))
      problems.push(`${name}: ${r.dir} is both an implementation and a reader`)
    if (!existsSync(join(root, r.dir))) {
      problems.push(`${name}: ${r.dir} does not exist`)
      continue
    }
    problems.push(...readsSuite(root, suites, name, r.dir))
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
    problems.push(...readsSuite(root, suites, name, impl.dir))
  }
  try {
    const released = Object.fromEntries(
      f.implementations.flatMap((i) => {
        const v = versions[i.dir]
        const bump = i.language === 'ts' ? bumps.get(i.name) : undefined
        return v === undefined ? [] : [[i.dir, bump === undefined ? v : bumpVersion(v, bump)]]
      }),
    )
    problems.push(...versionProblems(name, versions, released, config.catchingUp))
  } catch (e) {
    problems.push(`${name}: ${(e as Error).message}`)
  }
  return problems
}

/** The problem when no test under `dir` names the family's suite. */
function readsSuite(root: string, suites: string, family: string, dir: string): string[] {
  const named = suiteReaders(new Map([[dir, testSources(root, dir)]]), basename(suites)).get(dir)
  return named?.has(family) === true
    ? []
    : [`${family}: no test under ${dir}/tests names ${suites}/${family}/`]
}

/** The suite files of one family, by name, with their contents. */
function suiteFiles(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  if (!existsSync(dir)) return out
  for (const n of readdirSync(dir).filter((n) => n.endsWith('.json')))
    out.set(n, readFileSync(join(dir, n), 'utf8'))
  return out
}

/** Runs one command with the output shown as it runs, and returns its exit code. */
export type Run = (command: string, args: string[], cwd: string) => number

/** The default {@link Run}: inherits stdio, so a build's or generator's output shows live. */
export const streamRun: Run = (command, args, cwd) =>
  streamRunner(command).run(args, { cwd }).exitCode

/** A suite file a generator changed, added or removed, and the generator that did. */
export interface Regenerated {
  /** The file, relative to the root. */
  file: string
  generator: string
}

/** What {@link regenerate} needs besides the root. */
export interface RegenerateOptions extends RepoOptions {
  /** Only the families whose reference is this language. */
  reference?: string | undefined
  /** Runs the build and the generators; defaults to {@link streamRun}. */
  run?: Run | undefined
  /** Where progress lines go; defaults to `console.log`. */
  log?: ((line: string) => void) | undefined
}

/**
 * Builds what the generators import, runs each family's generator,
 * `reference` limiting them to one language, and returns each suite file a
 * generator changed, added or removed. The new files stay on disk. A build or
 * generator that fails throws.
 */
export function regenerate(root: string, options: RegenerateOptions = {}): Regenerated[] {
  const { reference } = options
  const run = options.run ?? streamRun
  const log = options.log ?? ((line: string) => process.stdout.write(`${line}\n`))
  const suites = suitesDir(options)
  const loaded = loadConfig(root, options)
  if ('problems' in loaded) throw new Error(loaded.problems.join('\n'))
  const families = JSON.parse(
    readFileSync(join(root, options.families ?? DEFAULT_FAMILIES), 'utf8'),
  ) as Record<string, Family>
  const must = (command: string, args: string[], cwd: string): void => {
    const code = run(command, args, cwd)
    if (code !== 0) throw new Error(`${[command, ...args].join(' ')} exited ${code}`)
  }
  const filters = generatorBuildFilters(families, reference)
  if (filters.length > 0) {
    const build = [...filters, '--if-present', 'run', 'build']
    log(`pnpm ${build.join(' ')}`)
    must('pnpm', build, root)
  }
  const changed: Regenerated[] = []
  for (const [name, f] of Object.entries(families)) {
    if (reference !== undefined && f.reference !== reference) continue
    const dir = join(root, suites, name)
    const before = suiteFiles(dir)
    const [cmd, ...args] = f.generator.split(' ')
    // A Rust generator runs in the Cargo workspace, the crates' parent directory.
    const cwd = f.reference === 'rust' ? join(root, loaded.config.libraries['rust']!) : root
    log(`${name}: ${f.generator}`)
    must(cmd!, args, cwd)
    const after = suiteFiles(dir)
    for (const file of new Set([...before.keys(), ...after.keys()])) {
      if (before.get(file) !== after.get(file)) {
        changed.push({
          file: relative(root, join(dir, file)).replaceAll('\\', '/'),
          generator: f.generator,
        })
      }
    }
  }
  return changed
}
