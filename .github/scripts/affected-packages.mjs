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
// diff fails. affected-packages.test.mjs tests the rules.
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
import { pathToFileURL } from 'node:url'

/** Files every package reads, or that decide how they are checked. */
const SHARED = [
  /^\.github\/workflows\/packages-ci\.yml$/,
  /^\.github\/scripts\/(affected-packages|check-packages|package-shape)\.mjs$/,
  /^package\.json$/,
  /^\.oxlintrc\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^\.npmrc$/,
  /^\.changeset\/config\.json$/,
]

/** Each packages/ts/* manifest, by its directory. */
export function workspace() {
  const manifests = new Map()
  for (const name of readdirSync('packages/ts').sort()) {
    const file = join('packages/ts', name, 'package.json')
    if (existsSync(file)) manifests.set(`packages/ts/${name}`, JSON.parse(readFileSync(file, 'utf8')))
  }
  return manifests
}

/** The workspace packages each package depends on, by directory. */
function dependencies(manifests) {
  const dirOf = new Map([...manifests].map(([dir, pkg]) => [pkg.name, dir]))
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
  return deps
}

/**
 * The package directories to check, sorted. `files` is the changed files, or
 * null when the diff failed.
 */
export function pick({ event, files, manifests }) {
  if (event !== 'pull_request' || files === null || files.some((f) => SHARED.some((re) => re.test(f)))) {
    return [...manifests.keys()].sort()
  }
  const out = new Set()
  for (const file of files) {
    const m = /^packages\/(ts|rust)\/([^/]+)\//.exec(file)
    if (m === null) continue
    const name = m[1] === 'rust' ? m[2].replace(/-wasm$/, '') : m[2]
    if (manifests.has(`packages/ts/${name}`)) out.add(`packages/ts/${name}`)
  }
  // Add dependents until nothing changes.
  const deps = dependencies(manifests)
  for (let grew = true; grew; ) {
    grew = false
    for (const [dir, on] of deps) {
      if (!out.has(dir) && on.some((d) => out.has(d))) {
        out.add(dir)
        grew = true
      }
    }
  }
  return [...out].sort()
}

/** `dirs` and every workspace package they depend on, sorted. */
export function withDependencies(dirs, manifests) {
  const deps = dependencies(manifests)
  const out = new Set(dirs)
  for (const dir of out) for (const d of deps.get(dir)) out.add(d)
  return [...out].sort()
}

/** The files changed between `base` and `head`, or null when the diff fails. */
function changedFiles(base, head) {
  try {
    const out = execFileSync('git', ['diff', '--name-only', '--no-renames', base, head], {
      encoding: 'utf8',
    })
    return out.split('\n').filter(Boolean)
  } catch {
    return null
  }
}

function main() {
  const [base = 'HEAD^1', head = 'HEAD'] = process.argv.slice(2)
  const event = process.env.EVENT
  const manifests = workspace()
  const files = event === 'pull_request' ? changedFiles(base, head) : null
  const packages = pick({ event, files, manifests })
  const filter = (dirs) => dirs.map((d) => `--filter ./${d}`).join(' ')
  const outputs = {
    packages: JSON.stringify(packages),
    filter: filter(packages),
    build: filter(withDependencies(packages, manifests)),
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
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
