// Packs each workspace package the way it will be published and checks the
// tarball: `pnpm pack` (which rewrites `workspace:` ranges), then publint, then
// Are The Types Wrong for a package that ships types, then a clean consumer:
// `npm install <tarball>` into an empty project, load every entry point under
// Node, and run the package's smoke check against it if the package has one.
// The smoke check is `tests/smoke.mjs` in the package directory. It is not
// shipped: it is copied into the consumer project and imports the package by
// name, so it runs against the installed tarball.
//
// Each package must also keep the shared shape (package-shape.mjs): dist-only
// ESM, no `bun` export condition, no TypeScript source in the tarball, no bun in
// its scripts, and no tsconfig `customConditions` or sibling `paths`; and the
// conventions in conventionProblems (author, engines, scripts, layout, docs,
// README sections, .gitignore, the pnpm catalog), plus no `catalog:` or
// `workspace:` range left in the packed package.json.
//
// Every packages/ts/* package is packed first. The consumer maps each other
// workspace package to its local tarball with npm `overrides`, so siblings
// resolve from local tarballs, not npm. A release bumps a library and its
// dependents together, and the new library version is not on npm yet.
//
//   node .github/scripts/check-packages.mjs [packages/ts/<name> ...]
//
// With no package arguments it checks every packages/ts/* package; with
// arguments, only those are checked, but all are still packed. The
// tarballs go to a temporary directory. Run `pnpm run build` first: the
// tarball must contain dist/.
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative, resolve } from 'node:path'

import {
  conventionProblems,
  packedManifestProblems,
  parseCatalog,
  parseJsonc,
  shapeProblems,
} from './package-shape.mjs'

const root = process.cwd()

const allDirs = []
const ts = join(root, 'packages', 'ts')
for (const name of existsSync(ts) ? readdirSync(ts).sort() : []) {
  if (existsSync(join(ts, name, 'package.json'))) allDirs.push(join(ts, name))
}
const args = process.argv.slice(2)
const dirs = args.length === 0 ? allDirs : [...new Set(args.map((d) => resolve(root, d)))]
const out = mkdtempSync(join(tmpdir(), 'check-packages-'))

const bin = (name) => join(root, 'node_modules', '.bin', name)
const run = (cmd, argv, cwd) =>
  execFileSync(cmd, argv, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })

/** The package's smoke check, or undefined if it has none. */
function smokeFile(pkgDir) {
  const file = join(pkgDir, 'tests', 'smoke.mjs')
  return existsSync(file) ? file : undefined
}

/** The specifiers a consumer can load: `name` plus each `exports` subpath
 * (pattern subpaths skipped), or `name` alone for a `main`-only package. */
function entryPoints(pkg) {
  if (pkg.exports === undefined) return pkg.main ? [pkg.name] : []
  if (typeof pkg.exports === 'string') return [pkg.name]
  const keys = Object.keys(pkg.exports)
  if (!keys.some((k) => k.startsWith('.'))) return [pkg.name] // conditions only
  return keys
    .filter((k) => !k.includes('*') && k !== './package.json')
    .map((k) => (k === '.' ? pkg.name : `${pkg.name}/${k.slice(2)}`))
}

/** Installs `tarball` into an empty project and loads each entry point the
 * way a Node consumer would: code through `import()`; a JSON entry (a config
 * preset, possibly with comments) is resolved and read, since its consumer
 * is a tool rather than Node. Then copies in the package's smoke check, if
 * it has one, and runs it there. */
function cleanConsumer(pkg, pkgDir, tarball, packed) {
  const consumer = mkdtempSync(join(tmpdir(), 'check-packages-consumer-'))
  try {
    const overrides = {}
    for (const [dir, p] of packed) {
      if (dir !== pkgDir && p.tarball) overrides[p.pkg.name] = `file:${p.tarball}`
    }
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({ name: 'consumer', private: true, type: 'module', overrides }),
    )
    run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', tarball], consumer)
    const specs = entryPoints(pkg)
    // import.meta.resolve uses the `import` conditions, as import() does.
    const probe = `
      import { readFileSync } from 'node:fs'
      import { fileURLToPath } from 'node:url'
      for (const spec of ${JSON.stringify(specs)}) {
        const resolved = fileURLToPath(import.meta.resolve(spec))
        const ok = resolved.endsWith('.json')
          ? readFileSync(resolved, 'utf8').trim().length > 0
          : Object.keys(await import(spec)).length > 0
        if (!ok) throw new Error(spec + ' loaded empty')
        console.log('consumer: loaded ' + spec)
      }
    `
    process.stdout.write(run('node', ['--input-type=module', '-e', probe], consumer))
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

/** The one license every library declares. */
const LICENSE = 'MIT OR Apache-2.0'

/** The paths in `tarball`, relative to the package root inside it. */
function packedFiles(tarball) {
  return run('tar', ['-tzf', tarball], root)
    .split('\n')
    .filter((f) => f && !f.endsWith('/'))
    .map((f) => f.replace(/^package\//, ''))
}

/** The package's tsconfig files that exist, parsed, by file name. */
function tsconfigs(pkgDir) {
  const out = {}
  for (const name of ['tsconfig.json', 'tsconfig.build.json']) {
    const file = join(pkgDir, name)
    if (existsSync(file)) out[name] = parseJsonc(readFileSync(file, 'utf8'))
  }
  return out
}

/** The package's files relative to it, skipping what a build or install leaves behind. */
function packageFiles(pkgDir, rel = '') {
  const out = []
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
function textOrNull(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

/** The manifest `pnpm pack` wrote into the tarball. */
function packedManifest(tarball) {
  return JSON.parse(run('tar', ['-xzOf', tarball, 'package/package.json'], root))
}

/** True when the manifest names a `types` entry, top level or in `exports`. */
function shipsTypes(pkg) {
  if (pkg.types || pkg.typings) return true
  return JSON.stringify(pkg.exports ?? {}).includes('"types"')
}

const packed = new Map()
for (const pkgDir of new Set([...allDirs, ...dirs])) {
  try {
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
    const packedName = run('pnpm', ['pack', '--pack-destination', out], pkgDir).trim().split('\n').pop()
    packed.set(pkgDir, { pkg, tarball: join(out, basename(packedName)) })
  } catch (error) {
    packed.set(pkgDir, { pkg: { name: basename(pkgDir) }, error })
  }
}

// The pnpm catalog, and every workspace package's `engines.node` by name.
const catalog = parseCatalog(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8'))
const engines = {}
for (const { pkg } of packed.values()) {
  if (pkg.engines?.node !== undefined) engines[pkg.name] = pkg.engines.node
}

let failed = 0
if (!existsSync(join(root, '.oxlintrc.json'))) {
  failed++
  console.error('FAILED: .oxlintrc.json is missing at the repository root; every package lints with it')
}
for (const pkgDir of dirs) {
  const { pkg, tarball, error } = packed.get(pkgDir)
  console.log(`\n== ${pkg.name}@${pkg.version} (${relative(root, pkgDir)})`)
  try {
    if (error) throw error
    if (pkg.license !== LICENSE) {
      throw new Error(`license is ${JSON.stringify(pkg.license)}, expected ${JSON.stringify(LICENSE)}`)
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
      }),
      ...packedManifestProblems(packedManifest(tarball)),
    ]
    if (shape.length > 0) {
      throw Object.assign(
        new Error(`the package is not in the shared shape:\n  ${shape.join('\n  ')}`),
        { shape: true },
      )
    }
    process.stdout.write(run(bin('publint'), ['run', tarball, '--strict'], root))
    if (shipsTypes(pkg)) {
      // An ESM-only package is not judged on CommonJS resolution.
      const profile = pkg.type === 'module' ? 'esm-only' : 'node16'
      process.stdout.write(run(bin('attw'), [tarball, '--profile', profile], root))
    } else {
      console.log('attw: skipped, the package ships no types')
    }
    cleanConsumer(pkg, pkgDir, tarball, packed)
  } catch (err) {
    failed++
    // The shape problems are one per line; the other tools' output is long.
    console.error(`FAILED: ${pkg.name}: ${err.shape ? err.message : err.message.split('\n')[0]}`)
    if (err.stdout) process.stdout.write(err.stdout)
  }
}
if (failed > 0) {
  console.error(`\n${failed} package(s) failed`)
  process.exit(1)
}
console.log(`\nall ${dirs.length} package(s) passed`)
