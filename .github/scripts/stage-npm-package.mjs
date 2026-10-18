// Stages a new library on npm so CI can publish it. For each package it
// builds and packs the package at version `0.0.1-stage`, publishes that
// tarball under the `stage` tag, then adds the GitHub Actions trusted
// publisher with `npm trust github`. package.json is restored after packing.
// npm can only add a trusted publisher to a package that already exists (see
// packages/README.md, "Publishing a new library for the first time").
//
//   node .github/scripts/stage-npm-package.mjs [--dry-run] <package> ...
//
// Each <package> is a package directory (packages/ts/<name>). A package already
// on npm is not published again, and one that already has a trusted publisher
// is left as it is, so a re-run is safe. Run it logged in to npm as an owner of
// the @osdlc scope. `npm trust` needs two-factor authentication on the account;
// npm asks for a one-time password or a browser login. npm runs through npx at
// the version packages-publish.yml uses, because `npm trust` needs 11.15 or
// later. A dry run publishes nothing and changes nothing on npm, but it does
// build the package.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const PLACEHOLDER = '0.0.1-stage'
const NPM = 'npm@11.19.1'
const OWNER = 'osdlc'
const REPO = 'osdlc'
const WORKFLOW = 'packages-publish.yml'

function usage(problem) {
  console.error(
    `${problem}\nusage: node .github/scripts/stage-npm-package.mjs [--dry-run] <package> ...`,
  )
  process.exit(2)
}

let parsed
try {
  parsed = parseArgs({ options: { 'dry-run': { type: 'boolean' } }, allowPositionals: true })
} catch (e) {
  usage(e.message)
}
const dryRun = parsed.values['dry-run'] ?? false
const dry = dryRun ? ['--dry-run'] : []
if (parsed.positionals.length === 0) usage('no package given')

/** Runs pnpm in a package directory. */
function pnpm(dir, args, stdout = 'inherit') {
  console.log(`  pnpm ${args.join(' ')}`)
  return spawnSync('pnpm', args, {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', stdout, 'inherit'],
  })
}

/** Runs npm at the pinned version. */
function npm(args, opts = {}) {
  return spawnSync('npx', ['-y', NPM, ...args], { encoding: 'utf8', ...opts })
}

/** Checks that `dir` is a publishable @osdlc package. Returns its directory and name. */
function readTarget(dir) {
  const manifest = join(dir, 'package.json')
  if (!existsSync(manifest)) throw new Error(`${dir}: no package.json`)
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
  if (pkg.private) throw new Error(`${dir}: the package is private`)
  if (typeof pkg.name !== 'string' || !pkg.name.startsWith(`@${OWNER}/`)) {
    throw new Error(`${dir}: the name is not in the @${OWNER} scope`)
  }
  if (typeof pkg.license !== 'string') throw new Error(`${dir}: no license`)
  return { dir, name: pkg.name }
}

/** True when the package exists, false on E404. Any other failure stops the script. */
function onNpm(name) {
  const r = npm(['view', name, 'name'])
  if (r.status === 0) return true
  if (r.stderr.includes('E404')) return false
  console.error(`npm view ${name} failed:\n${r.stderr}`)
  process.exit(1)
}

/** Builds and packs `dir` at the placeholder version, and publishes it under the `stage` tag. */
function publishPlaceholder(dir) {
  const manifest = join(dir, 'package.json')
  const original = readFileSync(manifest, 'utf8')
  const out = mkdtempSync(join(tmpdir(), 'stage-npm-package-'))
  try {
    const pkg = JSON.parse(original)
    writeFileSync(manifest, JSON.stringify({ ...pkg, version: PLACEHOLDER }, null, 2) + '\n')
    let tarball
    // Ctrl-C would otherwise exit before the finally restores package.json.
    const ignoreInterrupt = () => {}
    process.on('SIGINT', ignoreInterrupt)
    try {
      // pnpm pack, unlike npm pack, rewrites workspace: and catalog: versions.
      if (pnpm(dir, ['run', '--if-present', 'build']).status !== 0) return false
      const pack = pnpm(dir, ['pack', '--json', '--pack-destination', out], 'pipe')
      if (pack.status !== 0) return false
      tarball = JSON.parse(pack.stdout).filename
      if (!existsSync(tarball)) {
        console.error(`  pnpm pack reported ${tarball}, which does not exist.`)
        return false
      }
    } finally {
      writeFileSync(manifest, original)
      process.off('SIGINT', ignoreInterrupt)
    }
    const publish = ['publish', tarball, '--access', 'public', '--tag', 'stage', ...dry]
    console.log(`  npm ${publish.join(' ')}`)
    return npm(publish, { stdio: 'inherit' }).status === 0
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
}

let targets
try {
  // Check every package before publishing any.
  targets = parsed.positionals.map(readTarget)
} catch (e) {
  usage(e.message)
}

const who = npm(['whoami'])
const loggedIn = who.status === 0
if (!loggedIn && !dryRun) {
  console.error(`npm whoami failed; run \`npm login\` first.\n${who.stderr}`)
  process.exit(1)
}
console.log(`npm user: ${loggedIn ? who.stdout.trim() : '(not logged in)'}`)
if (dryRun) console.log('Dry run: nothing is published or changed on npm.')

const trust = [
  'trust',
  'github',
  '--file',
  WORKFLOW,
  '--repository',
  `${OWNER}/${REPO}`,
  '--allow-publish',
]
let failed = false
for (const { dir, name } of targets) {
  console.log(`\n${name}`)
  const existed = onNpm(name)
  if (existed) {
    console.log('  already on npm; no placeholder needed.')
  } else if (!publishPlaceholder(dir)) {
    console.error('  the placeholder publish failed; skipping its trusted publisher.')
    failed = true
    continue
  }

  if (existed && loggedIn) {
    const list = npm(['trust', 'list', name, '--json'])
    if (list.status === 0 && JSON.parse(list.stdout || '[]').length > 0) {
      console.log('  already has a trusted publisher; leaving it.')
      continue
    }
  }
  console.log(`  npm ${[...trust, name, ...dry].join(' ')}`)
  // npm cannot dry-run a trusted publisher without a login, or for a package
  // that is not on npm yet.
  if (dryRun && !(existed && loggedIn)) continue
  if (npm([...trust, name, '--yes', ...dry], { stdio: 'inherit' }).status !== 0) {
    console.error(`  npm trust failed. Add it by hand at https://www.npmjs.com/package/${name}/access:
    GitHub Actions, organization ${OWNER}, repository ${REPO}, workflow ${WORKFLOW}, no environment.`)
    failed = true
  }
}
process.exit(failed ? 1 : 0)
