// Packs each workspace package the way it will be published and checks the
// tarball: `pnpm pack` (which rewrites `workspace:` ranges), then publint, then
// Are The Types Wrong for a package that ships types, then a clean consumer:
// `npm install <tarball>` into an empty project, load every entry point under
// Node, and run the package's `smoke.mjs` from the installed copy if it ships
// one (that calls the API against the tarball's own dist/). Generated: written by
// sksizer/dev's scripts/sdlc-mirror/assemble.ts (edit
// scripts/sdlc-mirror/templates/hosted/github/scripts/check-packages.mjs there).
//
//   node .github/scripts/check-packages.mjs [--out <dir>] [packages/ts/<name> ...]
//   node .github/scripts/check-packages.mjs --resolve-tag <name>/vX.Y.Z
//
// With no package arguments it checks every packages/ts/* package. `--out`
// keeps the tarballs there (the publish workflow uploads the one it checked);
// otherwise they go to a temporary directory. Run `pnpm run build` first: the
// tarball must contain dist/.
//
// `--resolve-tag` checks nothing. It finds the one packages/*/<name> directory
// with a package.json, checks that its version equals the tag's, and prints
// `name=`, `dir=` and `version=` lines for the publish workflow. A missing or
// ambiguous match, or a version mismatch, prints an `::error::` line to stderr
// and exits 1.
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const root = process.cwd()
const args = process.argv.slice(2)

/** Finds the package a `<name>/vX.Y.Z` tag names, or exits 1. */
function resolveTag(tag) {
  const fail = (msg) => {
    console.error(`::error::${msg}`)
    process.exit(1)
  }
  // The name is one directory name, so the lookup cannot leave packages/.
  const m = /^([a-z0-9][a-z0-9._-]*)\/v(\d+\.\d+\.\d+.*)$/.exec(tag ?? '')
  if (!m) fail(`tag ${tag} is not <name>/vX.Y.Z`)
  const [, name, version] = m
  const packages = join(root, 'packages')
  const matches = existsSync(packages)
    ? readdirSync(packages, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => `packages/${e.name}/${name}`)
        .filter((dir) => existsSync(join(root, dir, 'package.json')))
        .sort()
    : []
  if (matches.length === 0) fail(`tag ${tag} names no packages/*/${name} with a package.json`)
  if (matches.length > 1) fail(`tag ${tag} matches more than one package: ${matches.join(', ')}`)
  const dir = matches[0]
  const pkg = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'))
  if (pkg.version !== version) {
    fail(`tag version ${version} does not match ${dir}/package.json version ${pkg.version}`)
  }
  console.log(`name=${pkg.name}`)
  console.log(`dir=${dir}`)
  console.log(`version=${version}`)
}

if (args[0] === '--resolve-tag') {
  resolveTag(args[1])
  process.exit(0)
}

let out = null
const dirs = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') out = resolve(args[++i])
  else dirs.push(args[i])
}
if (dirs.length === 0) {
  const ts = join(root, 'packages', 'ts')
  for (const name of existsSync(ts) ? readdirSync(ts).sort() : []) {
    if (existsSync(join(ts, name, 'package.json'))) dirs.push(join('packages', 'ts', name))
  }
}
out ??= mkdtempSync(join(tmpdir(), 'check-packages-'))
mkdirSync(out, { recursive: true })

const bin = (name) => join(root, 'node_modules', '.bin', name)
const run = (cmd, argv, cwd) =>
  execFileSync(cmd, argv, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })

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
 * is a tool rather than Node. Then runs the installed `smoke.mjs`, if the
 * package ships one. */
function cleanConsumer(pkg, tarball) {
  const consumer = mkdtempSync(join(tmpdir(), 'check-packages-consumer-'))
  try {
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({ name: 'consumer', private: true, type: 'module' }),
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
    const smoke = join(consumer, 'node_modules', ...pkg.name.split('/'), 'smoke.mjs')
    if (existsSync(smoke)) process.stdout.write(run('node', [smoke], consumer))
  } finally {
    rmSync(consumer, { recursive: true, force: true })
  }
}

/** True when the manifest names a `types` entry, top level or in `exports`. */
function shipsTypes(pkg) {
  if (pkg.types || pkg.typings) return true
  return JSON.stringify(pkg.exports ?? {}).includes('"types"')
}

let failed = 0
for (const dir of dirs) {
  const pkgDir = resolve(root, dir)
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
  console.log(`\n== ${pkg.name}@${pkg.version} (${dir})`)
  try {
    const packed = run('pnpm', ['pack', '--pack-destination', out], pkgDir).trim().split('\n').pop()
    const tarball = join(out, basename(packed))
    console.log(`packed ${tarball}`)
    process.stdout.write(run(bin('publint'), ['run', tarball, '--strict'], root))
    if (shipsTypes(pkg)) {
      // An ESM-only package is not judged on CommonJS resolution.
      const profile = pkg.type === 'module' ? 'esm-only' : 'node16'
      process.stdout.write(run(bin('attw'), [tarball, '--profile', profile], root))
    } else {
      console.log('attw: skipped, the package ships no types')
    }
    cleanConsumer(pkg, tarball)
  } catch (err) {
    failed++
    console.error(`FAILED: ${pkg.name}: ${err.message.split('\n')[0]}`)
    if (err.stdout) process.stdout.write(err.stdout)
  }
}
if (failed > 0) {
  console.error(`\n${failed} package(s) failed`)
  process.exit(1)
}
console.log(`\nall ${dirs.length} package(s) passed`)
