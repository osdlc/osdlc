// Stages a new library on npm so CI can publish it. For each package it
// publishes the `0.0.1-stage` placeholder, then adds the GitHub Actions trusted
// publisher with `npm trust github`. npm can only add a trusted publisher to a
// package that already exists (see packages/README.md, "Publishing a new
// library for the first time").
//
//   node .github/scripts/stage-npm-package.mjs [--dry-run] <package> ...
//
// Each <package> is a package directory (packages/ts/<name>). A package already
// on npm is not published again, and one that already has a trusted publisher
// is left as it is, so a re-run is safe. Run it logged in to npm as an owner of
// the @osdlc scope. `npm trust` needs two-factor authentication on the account;
// npm asks for a one-time password or a browser login. npm runs through npx at
// the version packages-publish.yml uses, because `npm trust` needs 11.15 or
// later.
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

/** Runs npm at the pinned version. */
function npm(args, opts = {}) {
  return spawnSync('npx', ['-y', NPM, ...args], { encoding: 'utf8', ...opts })
}

/** Name and licence of a publishable @osdlc package directory. */
function readTarget(dir) {
  const manifest = join(dir, 'package.json')
  if (!existsSync(manifest)) throw new Error(`${dir}: no package.json`)
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
  if (pkg.private) throw new Error(`${dir}: the package is private`)
  if (typeof pkg.name !== 'string' || !pkg.name.startsWith(`@${OWNER}/`)) {
    throw new Error(`${dir}: the name is not in the @${OWNER} scope`)
  }
  if (typeof pkg.license !== 'string') throw new Error(`${dir}: no license`)
  return { name: pkg.name, license: pkg.license }
}

/** True when the package exists, false on E404. Any other failure stops the script. */
function onNpm(name) {
  const r = npm(['view', name, 'name'])
  if (r.status === 0) return true
  if (r.stderr.includes('E404')) return false
  console.error(`npm view ${name} failed:\n${r.stderr}`)
  process.exit(1)
}

/** Publishes a two-file placeholder under the `stage` tag. */
function publishPlaceholder(name, license) {
  const dir = mkdtempSync(join(tmpdir(), 'stage-npm-package-'))
  try {
    const pkg = {
      name,
      version: PLACEHOLDER,
      description: `Placeholder so npm can set up trusted publishing. Releases come from ${OWNER}/${REPO}.`,
      license,
      repository: { type: 'git', url: `git+https://github.com/${OWNER}/${REPO}.git` },
    }
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
    writeFileSync(
      join(dir, 'README.md'),
      `# ${name}\n\nPlaceholder version. The first real release is published from https://github.com/${OWNER}/${REPO}.\n`,
    )
    const publish = ['publish', '--access', 'public', '--tag', 'stage', ...dry]
    console.log(`  npm ${publish.join(' ')}`)
    return npm(publish, { cwd: dir, stdio: 'inherit' }).status === 0
  } finally {
    rmSync(dir, { recursive: true, force: true })
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
if (dryRun) console.log('Dry run: nothing is published or changed.')

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
for (const { name, license } of targets) {
  console.log(`\n${name}`)
  const existed = onNpm(name)
  if (existed) {
    console.log('  already on npm; no placeholder needed.')
  } else if (!publishPlaceholder(name, license)) {
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
