// The shape every crate in the packages/rust Cargo workspace keeps, as checks
// over data that the entry point at the bottom reads from disk. The standard
// is docs/planning/standards/S-package-shape-rs.md.
//
// A published crate (the default):
//
//   - `edition`, `rust-version`, `license` and `repository` come from the
//     workspace (`<key>.workspace = true`), and `[lints] workspace = true`.
//   - `name` is the directory name. `description` is not empty.
//   - `readme = "README.md"`. `keywords` (at most 5, crates.io's limit) and
//     `categories` are not empty.
//   - `include` ships src/, README.md, CHANGELOG.md, LICENSE-MIT and
//     LICENSE-APACHE. It may list more (tests, fixtures).
//   - The directory holds README.md, CHANGELOG.md, LICENSE-MIT, LICENSE-APACHE,
//     src/ and examples/.
//   - README.md starts `# <name>`, has `## Install` showing `cargo add <name>`
//     and `## License` naming MIT and Apache. CHANGELOG.md starts `# Changelog`
//     (release-plz writes it).
//
// A crate with `publish = false` is not on crates.io, so it keeps only the
// code-health subset: the workspace fields and lints, the name, a description,
// the licence files and src/. It needs no README, CHANGELOG, examples, keywords,
// categories or `include`.
//
// Known limits of the TOML reader (below): no multi-line strings, and no quoted
// keys or table headers containing `.` or `=`. A manifest that needs one is
// reported as a problem for its crate, not parsed.
//
// Each check returns a list of problems, empty when the crate is fine.
// package-shape-rs.test.ts tests them.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { section } from './markdown-section.ts'

export { section }

/** A parsed TOML value. */
export type Toml = string | number | boolean | Toml[] | Table

/** A parsed TOML table. Fields are read defensively, so values are loosely typed. */
// oxlint-disable-next-line typescript/no-explicit-any
export type Table = { [key: string]: any }

/** The files a published crate ships and keeps. */
const DOC_FILES = ['README.md', 'CHANGELOG.md']
const LICENCE_FILES = ['LICENSE-MIT', 'LICENSE-APACHE']
/** The `[package]` keys a crate takes from the workspace. */
export const WORKSPACE_KEYS = ['edition', 'rust-version', 'license', 'repository']
/** crates.io accepts at most this many keywords. */
export const MAX_KEYWORDS = 5

// ---------------------------------------------------------------------------
// A minimal TOML reader, enough for the Cargo.toml files in packages/rust:
// `[table]` and `[[table]]` headers, `key = value` and `key.workspace = true`,
// strings, booleans, numbers, arrays (possibly over several lines) and inline
// tables. Anything else in a value is kept as its raw text.

/** `line` without a trailing `# comment` (a `#` inside a string stays). */
function stripComment(line: string): string {
  let quote: string | null = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote !== null) {
      if (c === '\\' && quote === '"') i++
      else if (c === quote) quote = null
    } else if (c === '"' || c === "'") quote = c
    else if (c === '#') return line.slice(0, i)
  }
  return line
}

/** How many unclosed `[`/`{` the text leaves open, ignoring strings. */
function depth(text: string): number {
  let quote: string | null = null
  let d = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote !== null) {
      if (c === '\\' && quote === '"') i++
      else if (c === quote) quote = null
    } else if (c === '"' || c === "'") quote = c
    else if (c === '[' || c === '{') d++
    else if (c === ']' || c === '}') d--
  }
  return d
}

/** Splits `text` at top-level commas. */
function splitTop(text: string): string[] {
  const parts: string[] = []
  let quote: string | null = null
  let d = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote !== null) {
      if (c === '\\' && quote === '"') i++
      else if (c === quote) quote = null
    } else if (c === '"' || c === "'") quote = c
    else if (c === '[' || c === '{') d++
    else if (c === ']' || c === '}') d--
    else if (c === ',' && d === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((p) => p.trim()).filter((p) => p !== '')
}

/** The index of the first top-level `=` in `text`, or -1. */
function equalsAt(text: string): number {
  let quote: string | null = null
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote !== null) {
      if (c === '\\' && quote === '"') i++
      else if (c === quote) quote = null
    } else if (c === '"' || c === "'") quote = c
    else if (c === '=') return i
  }
  return -1
}

/** A TOML value as JavaScript: string, boolean, number, array, object, or the raw text. */
export function parseValue(raw: string): Toml {
  const text = raw.trim()
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
    return JSON.parse(text)
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length >= 2) return text.slice(1, -1)
  if (text === 'true') return true
  if (text === 'false') return false
  if (/^[+-]?\d[\d_]*(\.\d+)?$/.test(text)) return Number(text.replaceAll('_', ''))
  if (text.startsWith('[') && text.endsWith(']')) return splitTop(text.slice(1, -1)).map(parseValue)
  if (text.startsWith('{') && text.endsWith('}')) {
    const out: Table = {}
    for (const entry of splitTop(text.slice(1, -1))) {
      const eq = equalsAt(entry)
      if (eq !== -1) setPath(out, entry.slice(0, eq).trim().split('.'), parseValue(entry.slice(eq + 1)))
    }
    return out
  }
  return text
}

/** Sets `value` at the dotted `path` in `obj`, making objects on the way. */
function setPath(obj: Table, path: string[], value: Toml): void {
  let at = obj
  for (const key of path.slice(0, -1)) {
    if (typeof at[key] !== 'object' || at[key] === null || Array.isArray(at[key])) at[key] = {}
    at = at[key]
  }
  at[path.at(-1)!] = value
}

/** Cargo.toml text as an object: `{ package: { name: ... }, lints: { workspace: true }, ... }`. */
export function parseToml(text: string): Table {
  const root: Table = {}
  let table = root
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = stripComment(lines[i]!).trim()
    if (line === '') continue
    const header = /^\[\[?\s*([^\]]+?)\s*\]\]?$/.exec(line)
    if (header !== null && !line.includes('=')) {
      const path = header[1]!.split('.').map((k) => k.trim().replace(/^"|"$/g, ''))
      if (line.startsWith('[[')) {
        let at = root
        for (const key of path.slice(0, -1)) at = at[key] ??= {}
        const list = (at[path.at(-1)!] ??= [])
        table = {}
        list.push(table)
      } else {
        table = root
        for (const key of path) table = table[key] ??= {}
      }
      continue
    }
    const eq = equalsAt(line)
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1)
    const noMultiline = (text: string) => {
      if (opensMultilineString(text)) throw new Error(`line ${i + 1}: multi-line strings are not supported`)
    }
    noMultiline(value)
    while (depth(value) > 0 && i + 1 < lines.length) {
      const next = stripComment(lines[++i]!).trim()
      noMultiline(next)
      value += ` ${next}`
    }
    setPath(table, key.split('.').map((k) => k.trim().replace(/^"|"$/g, '')), parseValue(value))
  }
  return root
}

/** Whether `text` has a `"""` or `'''` outside a one-line string. */
function opensMultilineString(text: string): boolean {
  for (let j = 0; j < text.length; j++) {
    if (text.startsWith('"""', j) || text.startsWith("'''", j)) return true
    const quote = text[j]
    if (quote !== '"' && quote !== "'") continue
    for (j++; j < text.length && text[j] !== quote; j++) if (quote === '"' && text[j] === '\\') j++
  }
  return false
}

/** The `members` of the workspace Cargo.toml text. */
export function workspaceMembers(text: string): string[] {
  const members = parseToml(text).workspace?.members
  return Array.isArray(members) ? members : []
}

// ---------------------------------------------------------------------------
// Checks

/** True when `value` is `{ workspace = true }`. */
const fromWorkspace = (value: Toml): boolean => value !== null && typeof value === 'object' && !Array.isArray(value) && value.workspace === true

/** True for a crate that is not published to crates.io. */
export function isUnpublished(manifest: Table): boolean {
  return manifest.package?.publish === false
}

/** What is wrong with the [package] and [lints] fields shared by every crate. */
export function manifestProblems(dirName: string, manifest: Table): string[] {
  const problems: string[] = []
  const pkg = manifest.package ?? {}
  if (pkg.name !== dirName) problems.push(`package.name is ${JSON.stringify(pkg.name)}; it must be the directory name "${dirName}"`)
  for (const key of WORKSPACE_KEYS) {
    if (!fromWorkspace(pkg[key])) problems.push(`package.${key} must be \`${key}.workspace = true\``)
  }
  if (typeof pkg.description !== 'string' || pkg.description.trim() === '') {
    problems.push('package.description is missing or empty')
  }
  if (!fromWorkspace(manifest.lints)) problems.push('[lints] must be `workspace = true`')
  return problems
}

/** What is wrong with the fields only a published crate needs. */
export function publishedManifestProblems(manifest: Table): string[] {
  const problems: string[] = []
  const pkg = manifest.package ?? {}
  if (pkg.readme !== 'README.md') problems.push('package.readme must be "README.md"')
  for (const key of ['keywords', 'categories']) {
    if (!Array.isArray(pkg[key]) || pkg[key].length === 0) problems.push(`package.${key} is missing or empty`)
  }
  if (Array.isArray(pkg.keywords) && pkg.keywords.length > MAX_KEYWORDS) {
    problems.push(`package.keywords has ${pkg.keywords.length} entries; crates.io allows ${MAX_KEYWORDS}`)
  }
  const include = pkg.include
  if (!Array.isArray(include)) {
    problems.push('package.include is missing; list src/, README.md, CHANGELOG.md, LICENSE-MIT and LICENSE-APACHE')
  } else {
    if (!include.some((p) => typeof p === 'string' && p.startsWith('src/'))) {
      problems.push('package.include does not ship src/ (add "src/**/*.rs")')
    }
    for (const file of [...DOC_FILES, ...LICENCE_FILES]) {
      if (!include.includes(file)) problems.push(`package.include does not ship ${file}`)
    }
  }
  return problems
}

/** What is wrong with the files in the crate directory. `files` and `dirs` are its entry names. */
export function layoutProblems(
  { files, dirs }: { files: string[]; dirs: string[] },
  published: boolean,
): string[] {
  const problems: string[] = []
  const need = published ? [...DOC_FILES, ...LICENCE_FILES] : LICENCE_FILES
  for (const f of need) if (!files.includes(f)) problems.push(`${f} is missing`)
  const needDirs = published ? ['src', 'examples'] : ['src']
  for (const d of needDirs) if (!dirs.includes(d)) problems.push(`${d}/ is missing`)
  return problems
}

/** What is wrong with README.md: its title and the `## Install` and `## License` sections. */
export function readmeProblems(name: string, readme: string): string[] {
  const problems: string[] = []
  const first = readme.split('\n')[0]
  if (first !== `# ${name}`) problems.push(`README.md starts ${JSON.stringify(first)}; start it "# ${name}"`)
  const install = section(readme, 'Install')
  if (install === null) {
    problems.push(`README.md has no "## Install" section; add one with \`cargo add ${name}\``)
  } else if (!install.split('\n').some((l) => l.includes('cargo add') && l.includes(name))) {
    problems.push(`README.md "## Install" does not show \`cargo add ${name}\``)
  }
  const licence = section(readme, 'License')
  if (licence === null) {
    problems.push('README.md has no "## License" section; name MIT and Apache-2.0')
  } else if (!licence.includes('MIT') || !licence.includes('Apache')) {
    problems.push('README.md "## License" does not name both MIT and Apache')
  }
  return problems
}

/** What is wrong with CHANGELOG.md's first line. */
export function changelogProblems(changelog: string): string[] {
  const first = changelog.split('\n')[0]
  return first === '# Changelog' ? [] : [`CHANGELOG.md starts ${JSON.stringify(first)}; start it "# Changelog"`]
}

/**
 * Every problem with one crate. `readme` and `changelog` are the file texts, or
 * null when the file is absent (layoutProblems reports that).
 */
export function crateProblems({
  dirName,
  manifest,
  entries,
  readme,
  changelog,
}: {
  dirName: string
  manifest: Table
  entries: { files: string[]; dirs: string[] }
  readme: string | null
  changelog: string | null
}): string[] {
  const published = !isUnpublished(manifest)
  const name = manifest.package?.name ?? dirName
  const problems = [...manifestProblems(dirName, manifest), ...layoutProblems(entries, published)]
  if (published) {
    problems.push(...publishedManifestProblems(manifest))
    if (readme !== null) problems.push(...readmeProblems(name, readme))
    if (changelog !== null) problems.push(...changelogProblems(changelog))
  }
  return problems
}

// ---------------------------------------------------------------------------
// Entry point: read packages/rust from disk, print the problems, exit non-zero.

/** The problems of every workspace member under `root`, as `{ member, problems }`. */
export function checkWorkspace(root: string): { member: string; problems: string[] }[] {
  const rustDir = join(root, 'packages', 'rust')
  let members: string[]
  try {
    members = workspaceMembers(readFileSync(join(rustDir, 'Cargo.toml'), 'utf8'))
  } catch (err) {
    return [{ member: 'packages/rust/Cargo.toml', problems: [`cannot parse packages/rust/Cargo.toml: ${(err as Error).message}`] }]
  }
  if (members.length === 0) return [{ member: 'packages/rust/Cargo.toml', problems: ['the workspace lists no members'] }]
  const results: { member: string; problems: string[] }[] = []
  for (const member of members) {
    const dir = join(rustDir, member)
    const manifestPath = join(dir, 'Cargo.toml')
    if (!existsSync(manifestPath)) {
      results.push({ member, problems: ['Cargo.toml is missing'] })
      continue
    }
    let manifest: Table
    try {
      manifest = parseToml(readFileSync(manifestPath, 'utf8'))
    } catch (err) {
      results.push({ member, problems: [`cannot parse packages/rust/${member}/Cargo.toml: ${(err as Error).message}`] })
      continue
    }
    const names = readdirSync(dir)
    const entries = {
      files: names.filter((n) => statSync(join(dir, n)).isFile()),
      dirs: names.filter((n) => statSync(join(dir, n)).isDirectory()),
    }
    const read = (file: string) => (entries.files.includes(file) ? readFileSync(join(dir, file), 'utf8') : null)
    results.push({
      member,
      problems: crateProblems({
        dirName: member,
        manifest,
        entries,
        readme: read('README.md'),
        changelog: read('CHANGELOG.md'),
      }),
    })
  }
  return results
}

function main() {
  const results = checkWorkspace(process.cwd())
  let failed = 0
  for (const { member, problems } of results) {
    if (problems.length === 0) continue
    failed++
    console.error(`FAILED: packages/rust/${member}`)
    for (const p of problems) console.error(`  ${p}`)
  }
  if (failed > 0) {
    console.error(`\n${failed} crate(s) failed`)
    process.exit(1)
  }
  console.log(`all ${results.length} crate(s) passed`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
