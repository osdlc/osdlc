/**
 * Packs each workspace package the way it will be published and checks the
 * tarball. For each package it runs `pnpm pack` (which rewrites `workspace:`
 * ranges), checks the shared shape, runs publint, runs Are The Types Wrong if
 * the package ships types, and then tries a clean consumer. The consumer step
 * runs `npm install <tarball>` in an empty project and loads every entry point
 * under Node. A package with optional peers is loaded twice: once without
 * them, where only an entry that needs a missing optional peer may fail, and
 * once with them installed. Then the package's smoke check runs, if it has
 * one. A stylesheet export must point at one `./dist/<name>.css` file. The smoke
 * check is `tests/smoke.mjs` in the package directory. It is not shipped. It
 * is copied into the consumer project and imports the package by name, so it
 * runs against the installed tarball.
 *
 * The shared shape is defined in shape-ts.ts: dist-only ESM, no `bun`
 * export condition, no TypeScript source in the tarball, no bun in its
 * scripts, and no tsconfig `customConditions` or sibling `paths`. It also
 * covers the conventions in conventionProblems (author, engines, scripts,
 * layout, docs, README sections, .gitignore, the pnpm catalog), and no
 * `catalog:` or `workspace:` range left in the packed package.json.
 *
 * Every package in the TypeScript folder (`tsDir`, packages/ts by default) is
 * packed first. The consumer maps each other
 * workspace package to its local tarball with npm `overrides`, so siblings
 * resolve from local tarballs, not npm. This matters because a release bumps
 * a library and its dependents together, and the new library version is not
 * on npm yet.
 *
 *   package-checks ts [<package dir> ...]
 *
 * With no arguments it checks every package. With arguments it
 * checks only those, but still packs all of them. The tarballs go to a
 * temporary directory. Run `pnpm run build` first, because the tarball must
 * contain dist/.
 */
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'

import { OSDLC, type PackageChecksConfig } from './config.ts'
import { capture, RunFailed } from './run.ts'
import {
  DECLARES_EXPORT,
  conventionProblems,
  entryPoints,
  optionalPeers,
  packedManifestProblems,
  parseCatalog,
  parseJsonc,
  peerName,
  shapeProblems,
  stylesheetEntries,
  stylesheetProblems,
} from './shape-ts.ts'
import type { PackageJson, Tsconfig } from './shape-ts.ts'

/** A package.json: the shape fields plus the ones this script reads. */
type Pkg = PackageJson & {
  name: string
  version?: string
  license?: string
  main?: string
  types?: string
  typings?: string
}

/** What packing one package produced: its tarball, or why it failed. */
interface Packed {
  pkg: Pkg
  tarball?: string
  error?: unknown
}

const run = capture

const require = createRequire(import.meta.url)

/**
 * The script a dependency of this package names as its `bin`, found on the
 * module paths beside this file. publint and attw are dependencies, so a
 * repository needs neither installed itself.
 */
function toolScript(pkg: string, binName: string): string {
  for (const base of require.resolve.paths(pkg) ?? []) {
    const manifest = join(base, pkg, 'package.json')
    if (!existsSync(manifest)) continue
    const bin = (
      JSON.parse(readFileSync(manifest, 'utf8')) as { bin?: string | Record<string, string> }
    ).bin
    const rel = typeof bin === 'string' ? bin : bin?.[binName]
    if (rel !== undefined) return join(dirname(manifest), rel)
  }
  throw new Error(`cannot find ${pkg}, a dependency of @osdlc/package-checks`)
}

/** Runs a tool script under this Node. */
const tool = (script: string, argv: string[], cwd: string): string =>
  run(process.execPath, [script, ...argv], cwd)

/** The package's smoke check, or undefined if it has none. */
function smokeFile(pkgDir: string): string | undefined {
  const file = join(pkgDir, 'tests', 'smoke.mjs')
  return existsSync(file) ? file : undefined
}

/**
 * The report for a package that failed. A shape error lists one problem per
 * line, and a failed command's message holds its stderr and stdout, so both
 * are shown whole; any other error by its first line.
 */
export function failureLine(name: string, caught: unknown): string {
  const err = caught as Error & { shape?: boolean }
  const whole = err.shape === true || caught instanceof RunFailed
  return `FAILED: ${name}: ${whole ? err.message : String(err.message).split('\n')[0]}`
}

/** Installs `tarball` into an empty project and loads each entry point the
 * way a Node consumer would. Code loads through `import()`. An entry with no
 * values passes if its `.d.ts` exports something. A JSON entry (a config
 * preset, possibly with comments) or a stylesheet is only resolved and read,
 * because its consumer is a tool, not Node.
 *
 * A package with optional peers is probed twice. First without them: an
 * entry may then fail only with ERR_MODULE_NOT_FOUND naming one of them, and
 * every other entry must load. Then with each optional peer installed at its
 * declared range: every entry must load. The package's smoke check, if it
 * has one, is copied in and run last, with the optional peers installed. */
function cleanConsumer(
  pkg: Pkg,
  pkgDir: string,
  tarball: string,
  packed: Map<string, Packed>,
): void {
  const consumer = mkdtempSync(join(tmpdir(), 'check-packages-consumer-'))
  try {
    const overrides: Record<string, string> = {}
    for (const [dir, p] of packed) {
      if (dir !== pkgDir && p.tarball) overrides[p.pkg.name] = `file:${p.tarball}`
    }
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({ name: 'consumer', private: true, type: 'module', overrides }),
    )
    run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', tarball], consumer)
    const specs = entryPoints(pkg)
    const peers = optionalPeers(pkg)
    // import.meta.resolve uses the `import` conditions, as import() does.
    const probe = (missing: string[]): string => `
      import { readFileSync } from 'node:fs'
      import { fileURLToPath } from 'node:url'
      const missing = ${JSON.stringify(missing)}
      const load = async (spec) => {
        try {
          return await import(spec)
        } catch (err) {
          const peer = missing.find((m) => String(err?.message).includes("'" + m + "'"))
          if (err?.code !== 'ERR_MODULE_NOT_FOUND' || peer === undefined) throw err
          console.log('consumer: ' + spec + ' needs the optional peer ' + peer)
          return null
        }
      }
      for (const spec of ${JSON.stringify(specs)}) {
        const resolved = fileURLToPath(import.meta.resolve(spec))
        // A types-only entry (interfaces, no values) loads empty; its
        // declaration file beside the JavaScript must still export something.
        const typesOnly = () => {
          try {
            return new RegExp(${JSON.stringify(DECLARES_EXPORT.source)}, 'm').test(
              readFileSync(resolved.replace(/\\.js$/, '.d.ts'), 'utf8'),
            )
          } catch {
            return false
          }
        }
        if (resolved.endsWith('.json') || resolved.endsWith('.css')) {
          if (readFileSync(resolved, 'utf8').trim().length === 0) throw new Error(spec + ' is empty')
        } else {
          const mod = await load(spec)
          if (mod === null) continue
          if (Object.keys(mod).length === 0 && !typesOnly()) throw new Error(spec + ' loaded empty')
        }
        console.log('consumer: loaded ' + spec)
      }
    `
    // A file, not `node -e`, so a failure names a short command line.
    const runProbe = (missing: string[]): void => {
      writeFileSync(join(consumer, 'probe.mjs'), probe(missing))
      process.stdout.write(run('node', ['probe.mjs'], consumer))
    }
    runProbe(peers.map(peerName))
    if (peers.length > 0) {
      run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', ...peers], consumer)
      console.log(`consumer: installed the optional peers ${peers.join(', ')}`)
      runProbe([])
    }
    const smoke = smokeFile(pkgDir)
    if (smoke) {
      copyFileSync(smoke, join(consumer, 'smoke.mjs'))
      process.stdout.write(run('node', ['smoke.mjs'], consumer))
    } else {
      console.log(`${pkg.name}: no smoke check (no tests/smoke.mjs)`)
    }
  } finally {
    rmSync(consumer, { recursive: true, force: true })
  }
}

/** The paths in `tarball`, relative to the package root inside it. */
function packedFiles(tarball: string): string[] {
  return run('tar', ['-tzf', tarball], dirname(tarball))
    .split('\n')
    .filter((f) => f && !f.endsWith('/'))
    .map((f) => f.replace(/^package\//, ''))
}

/** The package's tsconfig files that exist, parsed, by file name. */
function tsconfigs(pkgDir: string): Record<string, Tsconfig> {
  const out: Record<string, Tsconfig> = {}
  for (const name of ['tsconfig.json', 'tsconfig.build.json']) {
    const file = join(pkgDir, name)
    if (existsSync(file)) out[name] = parseJsonc(readFileSync(file, 'utf8')) as Tsconfig
  }
  return out
}

/** The package's files relative to it, skipping what a build or install leaves behind. */
function packageFiles(pkgDir: string, rel = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(join(pkgDir, rel), { withFileTypes: true })) {
    if (['node_modules', 'dist', 'coverage', '.git'].includes(entry.name)) continue
    if (entry.name.startsWith('.readme-')) continue
    const path = rel === '' ? entry.name : `${rel}/${entry.name}`
    if (entry.isDirectory()) out.push(...packageFiles(pkgDir, path))
    else out.push(path)
  }
  return out
}

/** The file's text, or null when it does not exist. */
function textOrNull(file: string): string | null {
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

/** The manifest `pnpm pack` wrote into the tarball. */
function packedManifest(tarball: string): PackageJson {
  return JSON.parse(
    run('tar', ['-xzOf', tarball, 'package/package.json'], dirname(tarball)),
  ) as PackageJson
}

/** True when the manifest names a `types` entry, top level or in `exports`. */
function shipsTypes(pkg: Pkg): boolean {
  if (pkg.types || pkg.typings) return true
  return JSON.stringify(pkg.exports ?? {}).includes('"types"')
}

/**
 * Packs and checks the packages in `args` (folders, relative to `root`), or
 * every package in `settings.tsDir` when `args` is empty, and returns the
 * exit code. Prints a section per package.
 */
export function checkTsPackages(
  repoRoot: string,
  args: string[] = [],
  settings: PackageChecksConfig = OSDLC,
): number {
  // Absolute, so the folders listed here and those named in `args` compare equal.
  const root = resolve(repoRoot)
  const allDirs: string[] = []
  const ts = join(root, settings.tsDir)
  for (const name of existsSync(ts) ? readdirSync(ts).sort() : []) {
    if (existsSync(join(ts, name, 'package.json'))) allDirs.push(join(ts, name))
  }
  const dirs = args.length === 0 ? allDirs : [...new Set(args.map((d) => resolve(root, d)))]
  const out = mkdtempSync(join(tmpdir(), 'check-packages-'))
  const publint = toolScript('publint', 'publint')
  const attw = toolScript('@arethetypeswrong/cli', 'attw')

  const packed = new Map<string, Packed>()
  for (const pkgDir of new Set([...allDirs, ...dirs])) {
    try {
      const pkg: Pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
      const packedName = run('pnpm', ['pack', '--pack-destination', out], pkgDir)
        .trim()
        .split('\n')
        .pop()
      packed.set(pkgDir, { pkg, tarball: join(out, basename(packedName!)) })
    } catch (error) {
      packed.set(pkgDir, { pkg: { name: basename(pkgDir) }, error })
    }
  }

  // The pnpm catalog, and every workspace package's `engines.node` by name.
  const workspaceFile = join(root, 'pnpm-workspace.yaml')
  const catalog = existsSync(workspaceFile) ? parseCatalog(readFileSync(workspaceFile, 'utf8')) : {}
  const engines: Record<string, string> = {}
  for (const { pkg } of packed.values()) {
    if (pkg.engines?.node !== undefined) engines[pkg.name] = pkg.engines.node as string
  }

  let failed = 0
  if (settings.rootLintConfig !== null && !existsSync(join(root, settings.rootLintConfig))) {
    failed++
    console.error(
      `FAILED: ${settings.rootLintConfig} is missing at the repository root; every package lints with it`,
    )
  }
  for (const pkgDir of dirs) {
    const { pkg, tarball: packedTarball, error } = packed.get(pkgDir)!
    console.log(`\n== ${pkg.name}@${pkg.version} (${relative(root, pkgDir)})`)
    try {
      if (error) throw error
      const tarball = packedTarball!
      if (pkg.license !== settings.license) {
        throw new Error(
          `license is ${JSON.stringify(pkg.license)}, expected ${JSON.stringify(settings.license)}`,
        )
      }
      console.log(`packed ${tarball}`)
      const shape = [
        ...shapeProblems({
          pkg,
          packedFiles: packedFiles(tarball),
          tsconfigs: tsconfigs(pkgDir),
        }),
        ...conventionProblems({
          dir: basename(pkgDir),
          pkg,
          files: packageFiles(pkgDir),
          tsconfigs: tsconfigs(pkgDir),
          readme: textOrNull(join(pkgDir, 'README.md')) ?? '',
          changelog: textOrNull(join(pkgDir, 'CHANGELOG.md')),
          gitignore: textOrNull(join(pkgDir, '.gitignore')),
          catalog,
          engines,
          settings,
        }),
        ...packedManifestProblems(packedManifest(tarball)),
        ...stylesheetProblems(pkg.exports),
      ]
      if (shape.length > 0) {
        throw Object.assign(
          new Error(`the package is not in the shared shape:\n  ${shape.join('\n  ')}`),
          { shape: true },
        )
      }
      // `build` re-stamps version.generated.ts, so a stale committed copy shows
      // as a working-tree change by now, where `stamp-version --check` would pass.
      if (pkg.scripts?.['stamp-version'] !== undefined) {
        run('pnpm', ['run', '--silent', 'stamp-version', '--check'], pkgDir)
        const changed = run(
          'git',
          ['status', '--porcelain', '--', ':(glob)**/version.generated.ts'],
          pkgDir,
        )
        if (changed.trim() !== '') {
          throw new Error(
            `version.generated.ts differs from the commit; run \`pnpm run stamp-version\` and commit it:\n${changed}`,
          )
        }
      }
      process.stdout.write(tool(publint, ['run', tarball, '--strict'], root))
      if (shipsTypes(pkg)) {
        // An ESM-only package is not judged on CommonJS resolution.
        const profile = pkg.type === 'module' ? 'esm-only' : 'node16'
        // A stylesheet is a file a tool reads, not a module: it has no types.
        const sheets = stylesheetEntries(pkg.exports)
        const exclude = sheets.length > 0 ? ['--exclude-entrypoints', ...sheets] : []
        process.stdout.write(tool(attw, [tarball, '--profile', profile, ...exclude], root))
      } else {
        console.log('attw: skipped, the package ships no types')
      }
      cleanConsumer(pkg, pkgDir, tarball, packed)
    } catch (caught) {
      failed++
      console.error(failureLine(pkg.name, caught))
    }
  }
  rmSync(out, { recursive: true, force: true })
  if (failed > 0) {
    console.error(`\n${failed} package(s) failed`)
    return 1
  }
  console.log(`\nall ${dirs.length} package(s) passed`)
  return 0
}
