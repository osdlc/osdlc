/**
 * The shape every crate in the Cargo workspace keeps, as checks over data
 * that checkWorkspace reads from disk. The standard is S-package-shape-rs in
 * osdlc/osdlc. The licence files are a setting (`licenseFiles`), osdlc's
 * LICENSE-MIT and LICENSE-APACHE by default.
 *
 * A published crate (the default):
 *
 *   - `edition`, `rust-version`, `license` and `repository` come from the
 *     workspace (`<key>.workspace = true`), and `[lints] workspace = true`.
 *   - `name` is the directory name. `description` is not empty.
 *   - `readme = "README.md"`. `keywords` (at most 5, crates.io's limit) and
 *     `categories` are not empty.
 *   - `include` ships src/, README.md, CHANGELOG.md, LICENSE-MIT and
 *     LICENSE-APACHE. It may list more (tests, fixtures).
 *   - The directory holds README.md, CHANGELOG.md, LICENSE-MIT, LICENSE-APACHE,
 *     src/ and examples/.
 *   - README.md starts `# <name>`, has `## Install` showing `cargo add <name>`
 *     and `## License` naming MIT and Apache. CHANGELOG.md starts `# Changelog`
 *     (release-plz writes it).
 *
 * A crate with `publish = false` is not on crates.io, so it keeps only the
 * code-health subset: the workspace fields and lints, the name, a description,
 * the licence files and src/. It needs no README, CHANGELOG, examples, keywords,
 * categories or `include`.
 *
 * Each check returns a list of problems, empty when the crate is fine.
 * tests/shape-rs.test.ts tests them.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { parse } from 'smol-toml'

import { OSDLC } from './config.ts'
import { section } from './markdown.ts'

/** A parsed TOML table. Fields are read defensively, so values are loosely typed. */
// oxlint-disable-next-line typescript/no-explicit-any
export type Table = { [key: string]: any }

/** The files a published crate ships and keeps, besides its licence files. */
const DOC_FILES = ['README.md', 'CHANGELOG.md']
/** The `[package]` keys a crate takes from the workspace. */
export const WORKSPACE_KEYS = ['edition', 'rust-version', 'license', 'repository']
/** crates.io accepts at most this many keywords. */
export const MAX_KEYWORDS = 5

/**
 * Cargo.toml text as plain objects: `{ package: { name: ... }, lints: {
 * workspace: true }, ... }`. Throws on text that is not TOML. Dates become
 * strings.
 */
export function parseToml(text: string): Table {
  return JSON.parse(JSON.stringify(parse(text))) as Table
}

/** The `members` of the workspace Cargo.toml text. */
export function workspaceMembers(text: string): string[] {
  const members = parseToml(text).workspace?.members
  return Array.isArray(members) ? members : []
}

// ---------------------------------------------------------------------------
// Checks

/** True when `value` is `{ workspace = true }`. */
const fromWorkspace = (value: unknown): boolean =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  (value as Table)['workspace'] === true

/** True for a crate that is not published to crates.io. */
export function isUnpublished(manifest: Table): boolean {
  return manifest.package?.publish === false
}

/** What is wrong with the [package] and [lints] fields shared by every crate. */
export function manifestProblems(dirName: string, manifest: Table): string[] {
  const problems: string[] = []
  const pkg = manifest.package ?? {}
  if (pkg.name !== dirName)
    problems.push(
      `package.name is ${JSON.stringify(pkg.name)}; it must be the directory name "${dirName}"`,
    )
  for (const key of WORKSPACE_KEYS) {
    if (!fromWorkspace(pkg[key]))
      problems.push(`package.${key} must be \`${key}.workspace = true\``)
  }
  if (typeof pkg.description !== 'string' || pkg.description.trim() === '') {
    problems.push('package.description is missing or empty')
  }
  if (!fromWorkspace(manifest.lints)) problems.push('[lints] must be `workspace = true`')
  return problems
}

/** What is wrong with the fields only a published crate needs. */
export function publishedManifestProblems(
  manifest: Table,
  licenseFiles: string[] = OSDLC.licenseFiles,
): string[] {
  const problems: string[] = []
  const pkg = manifest.package ?? {}
  if (pkg.readme !== 'README.md') problems.push('package.readme must be "README.md"')
  for (const key of ['keywords', 'categories']) {
    if (!Array.isArray(pkg[key]) || pkg[key].length === 0)
      problems.push(`package.${key} is missing or empty`)
  }
  if (Array.isArray(pkg.keywords) && pkg.keywords.length > MAX_KEYWORDS) {
    problems.push(
      `package.keywords has ${pkg.keywords.length} entries; crates.io allows ${MAX_KEYWORDS}`,
    )
  }
  const include = pkg.include
  if (!Array.isArray(include)) {
    problems.push(
      `package.include is missing; list src/, ${[...DOC_FILES, ...licenseFiles].join(', ')}`,
    )
  } else {
    if (!include.some((p) => typeof p === 'string' && p.startsWith('src/'))) {
      problems.push('package.include does not ship src/ (add "src/**/*.rs")')
    }
    for (const file of [...DOC_FILES, ...licenseFiles]) {
      if (!include.includes(file)) problems.push(`package.include does not ship ${file}`)
    }
  }
  return problems
}

/** What is wrong with the files in the crate directory. `files` and `dirs` are its entry names. */
export function layoutProblems(
  { files, dirs }: { files: string[]; dirs: string[] },
  published: boolean,
  licenseFiles: string[] = OSDLC.licenseFiles,
): string[] {
  const problems: string[] = []
  const need = published ? [...DOC_FILES, ...licenseFiles] : licenseFiles
  for (const f of need) if (!files.includes(f)) problems.push(`${f} is missing`)
  const needDirs = published ? ['src', 'examples'] : ['src']
  for (const d of needDirs) if (!dirs.includes(d)) problems.push(`${d}/ is missing`)
  return problems
}

/**
 * The word a README names for each licence in an SPDX expression:
 * `MIT OR Apache-2.0` gives MIT and Apache.
 */
export function licenceWords(license: string): string[] {
  return license
    .split(/\s+(?:OR|AND|WITH)\s+|[()]/)
    .map((id) => id.trim().split('-')[0]!)
    .filter((w) => w !== '')
}

/**
 * What is wrong with README.md: its title, and the `## Install` and
 * `## License` sections. The License section names each licence in `license`.
 */
export function readmeProblems(
  name: string,
  readme: string,
  license: string = OSDLC.license,
): string[] {
  const problems: string[] = []
  const first = readme.split('\n')[0]
  if (first !== `# ${name}`)
    problems.push(`README.md starts ${JSON.stringify(first)}; start it "# ${name}"`)
  const install = section(readme, 'Install')
  if (install === null) {
    problems.push(`README.md has no "## Install" section; add one with \`cargo add ${name}\``)
  } else if (!install.split('\n').some((l) => l.includes('cargo add') && l.includes(name))) {
    problems.push(`README.md "## Install" does not show \`cargo add ${name}\``)
  }
  const words = licenceWords(license)
  const licence = section(readme, 'License')
  if (licence === null) {
    problems.push(`README.md has no "## License" section; name ${words.join(' and ')}`)
  } else if (words.some((w) => !licence.includes(w))) {
    problems.push(
      `README.md "## License" does not name ${words.length > 1 ? 'each of ' : ''}${words.join(' and ')}`,
    )
  }
  return problems
}

/** What is wrong with CHANGELOG.md's first line. */
export function changelogProblems(changelog: string): string[] {
  const first = changelog.split('\n')[0]
  return first === '# Changelog'
    ? []
    : [`CHANGELOG.md starts ${JSON.stringify(first)}; start it "# Changelog"`]
}

/** The settings the crate checks read. */
export type CrateSettings = Pick<typeof OSDLC, 'license' | 'licenseFiles' | 'rustWorkspace'>

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
  settings = OSDLC,
}: {
  dirName: string
  manifest: Table
  entries: { files: string[]; dirs: string[] }
  readme: string | null
  changelog: string | null
  settings?: CrateSettings
}): string[] {
  const published = !isUnpublished(manifest)
  const name = manifest.package?.name ?? dirName
  const problems = [
    ...manifestProblems(dirName, manifest),
    ...layoutProblems(entries, published, settings.licenseFiles),
  ]
  if (published) {
    problems.push(...publishedManifestProblems(manifest, settings.licenseFiles))
    if (readme !== null) problems.push(...readmeProblems(name, readme, settings.license))
    if (changelog !== null) problems.push(...changelogProblems(changelog))
  }
  return problems
}

// ---------------------------------------------------------------------------
// Reading the workspace from disk.

/**
 * The problems of every member of the Cargo workspace at
 * `settings.rustWorkspace` under `root`, as `{ member, problems }`.
 */
export function checkWorkspace(
  root: string,
  settings: CrateSettings = OSDLC,
): { member: string; problems: string[] }[] {
  const ws = settings.rustWorkspace
  const rustDir = join(root, ws)
  let members: string[]
  try {
    members = workspaceMembers(readFileSync(join(rustDir, 'Cargo.toml'), 'utf8'))
  } catch (err) {
    return [
      {
        member: `${ws}/Cargo.toml`,
        problems: [`cannot parse ${ws}/Cargo.toml: ${(err as Error).message}`],
      },
    ]
  }
  if (members.length === 0)
    return [{ member: `${ws}/Cargo.toml`, problems: ['the workspace lists no members'] }]
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
      results.push({
        member,
        problems: [`cannot parse ${ws}/${member}/Cargo.toml: ${(err as Error).message}`],
      })
      continue
    }
    const names = readdirSync(dir)
    const entries = {
      files: names.filter((n) => statSync(join(dir, n)).isFile()),
      dirs: names.filter((n) => statSync(join(dir, n)).isDirectory()),
    }
    const read = (file: string) =>
      entries.files.includes(file) ? readFileSync(join(dir, file), 'utf8') : null
    results.push({
      member,
      problems: crateProblems({
        dirName: member,
        manifest,
        entries,
        readme: read('README.md'),
        changelog: read('CHANGELOG.md'),
        settings,
      }),
    })
  }
  return results
}
