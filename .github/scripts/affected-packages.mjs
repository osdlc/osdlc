// Picks the packages/ts/* packages a packages-ci.yml run checks, and writes
// them to $GITHUB_OUTPUT (or prints them when it is unset).
//
//   node .github/scripts/affected-packages.mjs [base] [head]
//
// On a pull_request (EVENT=pull_request) it checks each package with a file
// changed between `base` (default HEAD^1, the base branch side of the merge
// commit) and `head` (default HEAD), plus every package that depends on one of
// them. A change under packages/rust/<name>/ counts as a change to
// packages/ts/<name>, since a TypeScript twin reads its crate's fixtures; a
// `-wasm` crate counts for the package without the suffix. Every package is
// checked on any other event, when a shared input below changed, or when the
// diff fails.
//
// Outputs:
//   packages  JSON array of the package directories to check
//   filter    pnpm --filter flags for them
//   build     pnpm --filter flags for them and their workspace dependencies,
//             which a build needs first
//   dirs      the directories, space-separated, for check-packages.mjs
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Files every package reads, or that decide how they are checked. */
const SHARED = [
  /^\.github\/workflows\/packages-ci\.yml$/,
  /^\.github\/scripts\/(affected-packages|check-packages)\.mjs$/,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^\.npmrc$/,
  /^\.changeset\/config\.json$/,
]

const [base = 'HEAD^1', head = 'HEAD'] = process.argv.slice(2)

const manifests = new Map()
for (const name of readdirSync('packages/ts').sort()) {
  const file = join('packages/ts', name, 'package.json')
  if (existsSync(file)) manifests.set(`packages/ts/${name}`, JSON.parse(readFileSync(file, 'utf8')))
}
const dirOf = new Map([...manifests].map(([dir, pkg]) => [pkg.name, dir]))

/** Workspace packages each package depends on, by directory. */
const deps = new Map()
for (const [dir, pkg] of manifests) {
  const names = Object.keys({
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
    ...pkg.optionalDependencies,
  })
  deps.set(dir, names.filter((n) => dirOf.has(n)).map((n) => dirOf.get(n)))
}

/** The changed files, or null when every package should be checked. */
function changedFiles() {
  if (process.env.EVENT !== 'pull_request') return null
  try {
    const out = execFileSync('git', ['diff', '--name-only', '--no-renames', base, head], {
      encoding: 'utf8',
    })
    return out.split('\n').filter(Boolean)
  } catch {
    return null
  }
}

function selected(files) {
  if (files === null || files.some((f) => SHARED.some((re) => re.test(f)))) {
    return new Set(manifests.keys())
  }
  const out = new Set()
  for (const file of files) {
    const m = /^packages\/(ts|rust)\/([^/]+)\//.exec(file)
    if (m === null) continue
    const name = m[1] === 'rust' ? m[2].replace(/-wasm$/, '') : m[2]
    if (manifests.has(`packages/ts/${name}`)) out.add(`packages/ts/${name}`)
  }
  // Add dependents until nothing changes.
  for (let grew = true; grew; ) {
    grew = false
    for (const [dir, on] of deps) {
      if (!out.has(dir) && on.some((d) => out.has(d))) {
        out.add(dir)
        grew = true
      }
    }
  }
  return out
}

/** `dirs` and every workspace package they depend on. */
function withDependencies(dirs) {
  const out = new Set(dirs)
  for (const dir of out) for (const d of deps.get(dir)) out.add(d)
  return out
}

const files = changedFiles()
const packages = [...selected(files)].sort()
const filter = (dirs) => [...dirs].sort().map((d) => `--filter ./${d}`).join(' ')
const outputs = {
  packages: JSON.stringify(packages),
  filter: filter(packages),
  build: filter(withDependencies(packages)),
  dirs: packages.join(' '),
}

console.log(files === null ? 'checking every package' : `changed files: ${files.length}`)
for (const [k, v] of Object.entries(outputs)) console.log(`${k}=${v}`)
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(outputs)
      .map(([k, v]) => `${k}=${v}\n`)
      .join(''),
  )
}
