// The shape every packages/ts/* package keeps, as checks over data that
// check-packages.ts reads from disk and from the packed tarball:
//
//   - `exports` has no `bun` condition. Every entry is `types` and `default`,
//     both under dist/.
//   - The tarball ships no TypeScript source. A hand-written `.d.ts` is fine.
//   - The tarball ships no source maps: they would point at the unshipped source.
//   - No script invokes bun, and `@types/bun` is not a dependency.
//   - tsconfig.json and tsconfig.build.json set no `customConditions`, map no
//     `paths` entry to a file outside the package, and do not add bun types.
//     Packages resolve each other through their built dist/, so a typecheck
//     runs after the build.
//
// On top of that, the conventions every package keeps (conventionProblems):
//
//   - `author` is `sksizer`.
//   - `engines.node` is a subset of `>=22` and of every workspace dependency's
//     range, so a package never claims a runtime its dependency refuses.
//   - `typecheck` checks the source and the build config. `smoke` runs
//     `tests/smoke.mjs`, which exists.
//   - Source lives in `src/` (no TypeScript at the package root but
//     vitest.config.ts), tests in `tests/` (no `*.test.ts` under `src/`), and
//     `examples/` holds at least one `*.test.ts`. tsconfig.build.json emits
//     `src` with `rootDir: "src"`, so `dist/` mirrors `src/`.
//   - `docs/` holds only `planning/` and `guide/`. `planning/` has a README
//     index.
//   - CHANGELOG.md starts `# @osdlc/<name>`. README.md has `## Install` and
//     `## Licence` sections. `.gitignore` lists node_modules/, dist/, coverage/.
//   - A third-party dependency listed in pnpm-workspace.yaml's `catalog:` is
//     written `catalog:`. The packed manifest has no `catalog:` or
//     `workspace:` range left.
//   - No per-package .oxlintrc.json: the one at the repository root applies.
//   - The two config packages (tsconfig, prettier-config) ship no code, so they
//     are exempt from the build, test, src, examples and smoke rules, and instead
//     are ESM with an `exports` map, `sideEffects: false`, a SECURITY.md and a
//     CONTRIBUTING.md.
//
// Each check returns a list of problems, empty when the package is fine.
// package-shape-ts.test.ts tests them.
import { posix } from 'node:path'

import semver from 'semver'

/** A parsed package.json: only the fields the checks read. */
export interface PackageJson {
  name?: string
  author?: string
  type?: string
  sideEffects?: boolean
  exports?: unknown
  files?: string[]
  engines?: { node?: unknown }
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

type DepField = 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies'

/** A parsed tsconfig: only the fields the checks read. */
export interface Tsconfig {
  compilerOptions?: {
    customConditions?: unknown
    paths?: Record<string, unknown>
    types?: string[]
    rootDir?: string
  }
  include?: string[]
}

/** `text` as JSON: strips line and block comments (not inside strings) and trailing commas. */
export function parseJsonc(text: string): unknown {
  let out = ''
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '"') {
      let j = i + 1
      while (text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j + 1
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 2
    } else {
      out += c
      i++
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'))
}

/** The `exports` paths at which a `bun` condition appears. */
export function bunConditions(exportsField: unknown, path = 'exports'): string[] {
  if (exportsField === null || typeof exportsField !== 'object') return []
  const found: string[] = []
  for (const [key, value] of Object.entries(exportsField)) {
    if (key === 'bun') found.push(`${path}.bun`)
    found.push(...bunConditions(value, `${path}[${JSON.stringify(key)}]`))
  }
  return found
}

/** The packed files that are source maps (`.js.map`, `.d.ts.map`), which would point at unshipped source. */
export function shippedSourceMaps(packedFiles: string[]): string[] {
  return packedFiles.filter((f) => f.endsWith('.map'))
}

/** The packed files that are TypeScript source: `.ts`, `.mts`, `.cts`, `.tsx`, but not `.d.ts`. */
export function shippedSource(packedFiles: string[]): string[] {
  return packedFiles.filter((f) => /\.(ts|mts|cts|tsx)$/.test(f) && !/\.d\.[mc]?ts$/.test(f))
}

/** The scripts that invoke bun, as `name: command`. */
export function bunScripts(scripts: Record<string, string> = {}): string[] {
  return Object.entries(scripts)
    .filter(([, command]) => /(^|[\s;&|(])(bun|bunx)(\s|$)/.test(command))
    .map(([name, command]) => `${name}: ${command}`)
}

/** What is wrong with one parsed tsconfig, named `file` in the messages. */
export function tsconfigProblems(file: string, config: Tsconfig | undefined): string[] {
  const options = config?.compilerOptions ?? {}
  const problems: string[] = []
  if ('customConditions' in options) {
    problems.push(`${file} sets customConditions; workspace packages resolve through dist/`)
  }
  for (const [alias, targets] of Object.entries(options.paths ?? {})) {
    for (const target of Array.isArray(targets) ? targets : []) {
      if (posix.normalize(target).startsWith('..')) {
        problems.push(`${file} maps ${alias} to ${target}, outside the package`)
      }
    }
  }
  if ((options.types ?? []).includes('bun')) problems.push(`${file} adds the bun types`)
  return problems
}

/**
 * Every problem with the package's shape.
 *
 * `pkg` is the parsed package.json, `packedFiles` the paths in the tarball
 * relative to the package, `tsconfigs` the parsed tsconfig files by file name.
 */
export function shapeProblems({
  pkg,
  packedFiles,
  tsconfigs,
}: {
  pkg: PackageJson
  packedFiles: string[]
  tsconfigs: Record<string, Tsconfig>
}): string[] {
  const problems: string[] = []
  for (const path of bunConditions(pkg.exports)) {
    problems.push(`${path}: remove the bun condition; exports is { types, default } under dist/`)
  }
  for (const f of shippedSource(packedFiles)) problems.push(`the tarball ships TypeScript source: ${f}`)
  for (const f of shippedSourceMaps(packedFiles)) {
    problems.push(`the tarball ships a source map for unshipped source: ${f}; set declarationMap false`)
  }
  for (const s of bunScripts(pkg.scripts)) problems.push(`script invokes bun, use Node: ${s}`)
  if (pkg.devDependencies?.['@types/bun'] !== undefined) {
    problems.push('@types/bun is a devDependency; tests run on Vitest under Node')
  }
  for (const [file, config] of Object.entries(tsconfigs)) {
    problems.push(...tsconfigProblems(file, config))
  }
  return problems
}

// ---------------------------------------------------------------------------
// Conventions

/** The one author every package declares. */
export const AUTHOR = 'sksizer'

/** The widest `engines.node` any package may declare. */
export const BASE_ENGINE = '>=22'

/** The `typecheck` script: the source and tests, then the emit config. */
export const TYPECHECK = 'tsc --noEmit && tsc -p tsconfig.build.json --noEmit'

/** The packages that ship configuration and no code. */
export const CONFIG_PACKAGES = ['tsconfig', 'prettier-config']

const GITIGNORE_ENTRIES = ['node_modules/', 'dist/', 'coverage/']

/** The `catalog:` entries of a pnpm-workspace.yaml, as `{ name: version }`. */
export function parseCatalog(text: string): Record<string, string> {
  const catalog: Record<string, string> = {}
  let inside = false
  for (const line of text.split('\n')) {
    if (/^catalog:\s*$/.test(line)) {
      inside = true
      continue
    }
    if (!inside || line.trim() === '' || line.startsWith('#')) continue
    if (/^\S/.test(line)) break
    const m = line.match(/^\s+(?:'([^']+)'|"([^"]+)"|([^\s:#]+)):\s*(?:'([^']*)'|"([^"]*)"|([^\s#]+))/)
    if (m) catalog[(m[1] ?? m[2] ?? m[3])!] = (m[4] ?? m[5] ?? m[6])!
  }
  return catalog
}

/** The body of the `## <heading>` section of a markdown file, or null. */
export function section(markdown: string, heading: string): string | null {
  const lines = markdown.split('\n')
  let inFence = false
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^(```|~~~)/.test(lines[i]!)) inFence = !inFence
    if (inFence) continue
    if (start === -1) {
      if (lines[i] === `## ${heading}`) start = i + 1
    } else if (/^## /.test(lines[i]!)) {
      return lines.slice(start, i).join('\n')
    }
  }
  return start === -1 ? null : lines.slice(start).join('\n')
}

/** What is wrong with `author`. */
export function authorProblems(pkg: PackageJson): string[] {
  return pkg.author === AUTHOR ? [] : [`author is ${JSON.stringify(pkg.author)}; set "author": "${AUTHOR}"`]
}

/**
 * What is wrong with `engines.node`: it must exist, be a subset of {@link BASE_ENGINE}
 * and of the range of every workspace dependency that declares one. `engines` maps
 * a dependency name to its range, for the workspace packages only.
 */
export function enginesProblems(pkg: PackageJson, engines: Record<string, string>): string[] {
  const range = pkg.engines?.node
  if (typeof range !== 'string' || semver.validRange(range) === null) {
    return [`engines.node is ${JSON.stringify(range)}; declare a range, ${BASE_ENGINE} unless a dependency needs less`]
  }
  const problems: string[] = []
  if (!semver.subset(range, BASE_ENGINE)) {
    problems.push(`engines.node ${range} is wider than ${BASE_ENGINE}; narrow it`)
  }
  const deps = { ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies }
  for (const dep of Object.keys(deps).sort()) {
    const depRange = engines[dep]
    if (depRange === undefined) continue
    if (!semver.subset(range, depRange)) {
      problems.push(
        `engines.node ${range} is wider than ${dep}'s ${depRange}; a package may not claim a runtime its dependency refuses, so set it to ${depRange}`,
      )
    }
  }
  return problems
}

/** What is wrong with the `typecheck` and `smoke` scripts. */
export function scriptProblems(pkg: PackageJson, files: string[]): string[] {
  const problems: string[] = []
  if (pkg.scripts?.typecheck !== TYPECHECK) {
    problems.push(`scripts.typecheck is ${JSON.stringify(pkg.scripts?.typecheck)}; set it to "${TYPECHECK}"`)
  }
  if (pkg.scripts?.smoke !== 'node tests/smoke.mjs') {
    problems.push('scripts.smoke is not "node tests/smoke.mjs"; add the script and the smoke check')
  }
  if (!files.includes('tests/smoke.mjs')) {
    problems.push('tests/smoke.mjs is missing; add a smoke check that imports every entry from the built package')
  }
  return problems
}

const TS_FILE = /\.(ts|mts|cts|tsx)$/

/**
 * What is wrong with the layout of a code package. `files` are the package's
 * files relative to its directory (not node_modules, dist or coverage), with `/`.
 */
export function layoutProblems(files: string[], tsconfigs: Record<string, Tsconfig> = {}): string[] {
  const problems: string[] = []
  for (const f of files) {
    if (!f.includes('/') && TS_FILE.test(f) && f !== 'vitest.config.ts') {
      problems.push(`${f} sits at the package root; move TypeScript source into src/`)
    }
    if (f.startsWith('src/') && /\.(test|spec)\.[mc]?[jt]sx?$/.test(f)) {
      problems.push(`${f} is a test under src/; move it to tests/`)
    }
  }
  if (!files.some((f) => f.startsWith('src/') && TS_FILE.test(f))) {
    problems.push('src/ has no TypeScript source; keep the source under src/')
  }
  if (!files.some((f) => /^examples\/.*\.test\.ts$/.test(f))) {
    problems.push('examples/ has no *.test.ts; add one that runs the README example through the package name')
  }
  const build = tsconfigs['tsconfig.build.json']
  if (build !== undefined) {
    if (build.compilerOptions?.rootDir !== 'src') {
      problems.push('tsconfig.build.json: set "rootDir": "src" so dist/ mirrors src/')
    }
    const include = build.include ?? []
    if (include.length !== 1 || include[0] !== 'src') {
      problems.push('tsconfig.build.json: set "include": ["src"]')
    }
  }
  return problems
}

const DOCS_FOLDERS = ['planning', 'guide']

/** What is wrong with the `docs/` folder. */
export function docsProblems(files: string[]): string[] {
  const docs = files.filter((f) => f.startsWith('docs/'))
  if (docs.length === 0) return []
  const problems: string[] = []
  // guide/ is the user guide the site publishes under the library's page.
  const outside = [...new Set(docs.map((f) => f.split('/')[1]!))].filter((d) => !DOCS_FOLDERS.includes(d))
  for (const d of outside.sort()) problems.push(`docs/${d} is outside docs/planning/ and docs/guide/; move it under one`)
  if (docs.some((f) => f.startsWith('docs/planning/')) && !files.includes('docs/planning/README.md')) {
    problems.push('docs/planning/README.md is missing; add the index of the planning documents')
  }
  return problems
}

/** What is wrong with the first line of CHANGELOG.md. Nothing when there is no changelog. */
export function changelogProblems(name: string, changelog: string | null): string[] {
  if (changelog === null) return []
  const first = changelog.split('\n')[0]!
  return first === `# ${name}` ? [] : [`CHANGELOG.md starts ${JSON.stringify(first)}; start it "# ${name}"`]
}

/** What is wrong with README.md's `## Install` and `## Licence` sections. */
export function readmeProblems(name: string, readme: string): string[] {
  const problems: string[] = []
  const install = section(readme, 'Install')
  if (install === null) {
    problems.push(`README.md has no "## Install" section; add one with \`npm install ${name}\``)
  } else if (!install.split('\n').some((l) => l.includes('npm install') && l.includes(name))) {
    problems.push(`README.md "## Install" does not show \`npm install ${name}\``)
  }
  const licence = section(readme, 'Licence')
  if (licence === null) {
    problems.push('README.md has no "## Licence" section; add `MIT OR Apache-2.0` and link LICENSE-MIT and LICENSE-APACHE')
  } else {
    if (!licence.includes('MIT OR Apache-2.0')) problems.push('README.md "## Licence" does not say `MIT OR Apache-2.0`')
    for (const file of ['LICENSE-MIT', 'LICENSE-APACHE']) {
      if (!licence.includes(`](./${file})`)) problems.push(`README.md "## Licence" does not link ${file}`)
    }
  }
  return problems
}

/** What is wrong with .gitignore. `gitignore` is null when the file is missing, which is a problem. */
export function gitignoreProblems(gitignore: string | null): string[] {
  if (gitignore === null) return ['.gitignore is missing; list node_modules/, dist/ and coverage/']
  const lines = gitignore.split('\n').map((l) => l.trim())
  return GITIGNORE_ENTRIES.filter((e) => !lines.includes(e)).map((e) => `.gitignore does not list ${e}`)
}

/**
 * Third-party dependencies that the pnpm catalog covers must be written `catalog:`.
 * Peer ranges are exempt: they say which versions work, not which one to install.
 */
export function catalogProblems(pkg: PackageJson, catalog: Record<string, string>): string[] {
  const problems: string[] = []
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [dep, range] of Object.entries(pkg[field as DepField] ?? {})) {
      if (dep in catalog && range !== 'catalog:') {
        problems.push(`${field}.${dep} is ${JSON.stringify(range)}; pnpm-workspace.yaml's catalog pins it, so write "catalog:"`)
      }
      if (range === 'catalog:' && !(dep in catalog)) {
        problems.push(`${field}.${dep} is "catalog:" but pnpm-workspace.yaml's catalog has no ${dep}`)
      }
    }
  }
  return problems
}

/** What is left unresolved in the manifest `pnpm pack` wrote into the tarball. */
export function packedManifestProblems(manifest: PackageJson): string[] {
  const problems: string[] = []
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [dep, range] of Object.entries(manifest[field as DepField] ?? {})) {
      if (/^(catalog|workspace):/.test(range)) {
        problems.push(`the packed ${field}.${dep} is ${JSON.stringify(range)}; pack with pnpm so it becomes a version`)
      }
    }
  }
  return problems
}

/** What is wrong with a config package (tsconfig, prettier-config). */
export function configPackageProblems(pkg: PackageJson, files: string[]): string[] {
  const problems: string[] = []
  if (pkg.type !== 'module') problems.push('type is not "module"; set "type": "module"')
  if (pkg.exports === undefined || typeof pkg.exports !== 'object') {
    problems.push('exports is missing; map every file a consumer may name')
  }
  if (pkg.sideEffects !== false) problems.push('sideEffects is not false; set "sideEffects": false')
  for (const file of ['SECURITY.md', 'CONTRIBUTING.md']) {
    if (!files.includes(file)) problems.push(`${file} is missing; add it as the code packages have`)
    else if (!(pkg.files ?? []).includes(file)) problems.push(`package.json "files" does not list ${file}`)
  }
  return problems
}

/**
 * The convention problems of one package.
 *
 * - `dir`: the package's directory name, such as `typed-git`.
 * - `files`: its files, relative to it.
 * - `tsconfigs`: its parsed tsconfig files, by file name.
 * - `readme`, `changelog` (null when none) and `gitignore` (null when none):
 *   file texts.
 * - `catalog`: the pnpm catalog.
 * - `engines`: the `engines.node` of each workspace package, by name.
 */
export function conventionProblems({
  dir,
  pkg,
  files,
  tsconfigs,
  readme,
  changelog,
  gitignore,
  catalog,
  engines,
}: {
  dir: string
  pkg: PackageJson
  files: string[]
  tsconfigs: Record<string, Tsconfig>
  readme: string
  changelog: string | null
  gitignore: string | null
  catalog: Record<string, string>
  engines: Record<string, string>
}): string[] {
  const config = CONFIG_PACKAGES.includes(dir)
  const problems: string[] = [
    ...authorProblems(pkg),
    ...docsProblems(files),
    ...changelogProblems(pkg.name!, changelog),
    ...readmeProblems(pkg.name!, readme),
    ...gitignoreProblems(gitignore),
    ...catalogProblems(pkg, catalog),
  ]
  if (files.includes('.oxlintrc.json')) {
    problems.push('.oxlintrc.json: delete it; the one at the repository root applies to every package')
  }
  if (config) problems.push(...configPackageProblems(pkg, files))
  else {
    problems.push(
      ...enginesProblems(pkg, engines),
      ...scriptProblems(pkg, files),
      ...layoutProblems(files, tsconfigs),
    )
  }
  return problems
}

/**
 * A `.d.ts` line that exports something. tsc writes `export {};` for a module
 * with no exports, so that line alone does not count.
 */
export const DECLARES_EXPORT = /^export (?!\{\s*\};?\s*$)/m
