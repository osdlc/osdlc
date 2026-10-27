// Builds the tradecraft binary and turns it into release assets and npm
// packages: one launcher package plus one package per platform, the esbuild
// layout. .github/workflows/tradecraft-release.yml and the local smoke test
// both drive this file, so they build the same way. Node 24 runs it directly
// by stripping the types, like the tooling in scripts/.
//
//   node packages/rust/tradecraft/release/dist.ts <verb> [flags]
//
//   version  [--version <v>] [--tag <t>]
//                                  the crate version; fails if --version or --tag differs
//   matrix                         GitHub Actions build matrix, as JSON
//   build    [--platform <key>]    release binary into <out>/binaries/<key>/
//   notices                        THIRD_PARTY_NOTICES.md from cargo-about
//   assemble [--version <v>] [--allow-missing]
//                                  package dirs into <out>/packages/
//   pack                           npm pack every package into <out>/tarballs/
//   publish  [--dry-run]           npm publish, platform packages first; skips published versions
//   release-assets [--version <v>] renamed binaries, SHA256SUMS, notices and install.sh into <out>/release/
//   install-check                  install the packed launcher + this machine's package, run it
//   smoke                          build, assemble, pack, install and run, for this machine
//   formula  [--version <v>]       Homebrew formula from <out>/release/SHA256SUMS into <out>/tradecraft.rb
//   stage    [--dry-run]           owner only: placeholder publish + trusted publisher per package
//
// Every verb takes `--out <dir>` (default packages/rust/target/tradecraft-dist).

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { parseSums, renderFormula } from '../../../../scripts/homebrew-formula.ts'
import {
  binaryPathInPackage,
  findPlatform,
  type Platform,
  PLATFORMS,
  platformKey,
  platformPackageName,
  PRODUCT,
  releaseAssetName,
} from './product.ts'

const HERE = import.meta.dirname
const CRATE_DIR = resolve(HERE, '..')
const WORKSPACE = resolve(CRATE_DIR, '..')
const REPO = resolve(WORKSPACE, '../..')
const CRATE_MANIFEST = join(CRATE_DIR, 'Cargo.toml')
const TEMPLATES = join(HERE, 'templates')
const NOTICES = 'THIRD_PARTY_NOTICES.md'
const LICENSES = ['LICENSE-MIT', 'LICENSE-APACHE']
/** The npm that `stage` runs: `npm trust` needs 11.15 or later. Matches packages-publish.yml. */
const STAGE_NPM = 'npm@11.19.1'
const PLACEHOLDER = '0.0.1-stage'

interface Layout {
  binaries: string
  packages: string
  tarballs: string
  release: string
  releaseNotes: string
  notices: string
  formula: string
}

function layout(out: string): Layout {
  return {
    binaries: join(out, 'binaries'),
    packages: join(out, 'packages'),
    tarballs: join(out, 'tarballs'),
    release: join(out, 'release'),
    releaseNotes: join(out, 'release-notes.md'),
    notices: join(out, NOTICES),
    formula: join(out, `${PRODUCT.binary}.rb`),
  }
}

interface RunOptions {
  cwd?: string
  env?: Record<string, string>
  /** Inherit stdout and stderr, for long builds. The result then has no stdout. */
  stream?: boolean
}

interface RunResult {
  status: number
  stdout: string
  stderr: string
}

function run(
  cmd: string,
  args: string[],
  { cwd = REPO, env, stream = false }: RunOptions = {},
): RunResult {
  const r = spawnSync(cmd, args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    encoding: 'utf8',
    stdio: ['ignore', stream ? 'inherit' : 'pipe', stream ? 'inherit' : 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`)
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

function runChecked(cmd: string, args: string[], opts: RunOptions = {}): RunResult {
  const r = run(cmd, args, opts)
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}\n${r.stderr.trim()}`)
  }
  return r
}

/** `package.version` of a Cargo.toml. It must be a literal string, not `version.workspace`. */
export function manifestVersion(toml: string): string {
  let inPackage = false
  for (const line of toml.split('\n')) {
    const header = /^\s*\[([^\]]+)\]\s*(#.*)?$/.exec(line)
    if (header) {
      inPackage = header[1]!.trim() === 'package'
      continue
    }
    const m = inPackage ? /^\s*version\s*=\s*"([^"]+)"/.exec(line) : null
    if (m) return m[1]!
  }
  throw new Error('package.version must be a literal string')
}

/** The version every package carries: the crate's own, so `--version` and npm agree. */
export function crateVersion(manifest = CRATE_MANIFEST): string {
  return manifestVersion(readFileSync(manifest, 'utf8'))
}

/** The version in a release tag, `tradecraft/v0.3.5` to `0.3.5`. */
export function tagVersion(tag: string): string {
  const ref = tag.replace(/^refs\/tags\//, '')
  if (!ref.startsWith(PRODUCT.tagPrefix)) {
    throw new Error(`tag ${tag} is not a ${PRODUCT.crate} release tag (${PRODUCT.tagPrefix}X.Y.Z)`)
  }
  return ref.slice(PRODUCT.tagPrefix.length)
}

function checkVersion(requested: string | undefined): string {
  const version = crateVersion()
  if (requested !== undefined && requested.replace(/^v/, '') !== version) {
    throw new Error(
      `requested version ${requested} does not match ${PRODUCT.crate}'s Cargo.toml (${version}). ` +
        'The packages stay in lockstep with the crate.',
    )
  }
  return version
}

function hostPlatform(): Platform {
  return findPlatform(`${process.platform}-${process.arch}`)
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function copyExecutable(src: string, dest: string): void {
  copyFileSync(src, dest)
  chmodSync(dest, 0o755)
}

/** Reads a package.json template and drops its `//` note. */
function readTemplate(name: string): Record<string, unknown> {
  const { '//': _, ...template } = readJson<Record<string, unknown>>(
    join(TEMPLATES, name, 'package.json'),
  )
  return template
}

/** Where the built binary of a platform lives under `<out>/binaries/`. */
function binaryPath(l: Layout, platform: Platform): string {
  return join(l.binaries, platformKey(platform), PRODUCT.binary)
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => values[key] ?? whole)
}

// ---------------------------------------------------------------- matrix

export function matrix(): { include: Record<string, string>[] } {
  return {
    include: PLATFORMS.map((p) => ({
      key: platformKey(p),
      rustTarget: p.rustTarget,
      runner: p.runner,
      builder: p.builder,
    })),
  }
}

// ---------------------------------------------------------------- build

function cargoTargetDir(): string {
  const { stdout } = runChecked('cargo', ['metadata', '--no-deps', '--format-version', '1'], {
    cwd: WORKSPACE,
  })
  return (JSON.parse(stdout) as { target_directory: string }).target_directory
}

function build(platform: Platform, l: Layout): string {
  // Keep build-machine paths out of panic locations, and strip symbols. The
  // last matching remap wins, so the repo (inside $HOME locally) goes after
  // $HOME.
  const rustflags = [`--remap-path-prefix=${homedir()}=~`, `--remap-path-prefix=${REPO}=.`]
  const subcommand = platform.builder === 'zigbuild' ? 'zigbuild' : 'build'
  const result = run(
    'cargo',
    [subcommand, '--release', '--locked', '-p', PRODUCT.crate, '--target', platform.rustTarget],
    {
      cwd: WORKSPACE,
      stream: true,
      env: {
        // The \x1f-separated form, so a path with a space stays one argument.
        CARGO_ENCODED_RUSTFLAGS: rustflags.join('\x1f'),
        CARGO_PROFILE_RELEASE_STRIP: 'symbols',
        CARGO_PROFILE_RELEASE_LTO: 'thin',
      },
    },
  )
  if (result.status !== 0) throw new Error(`cargo ${subcommand} failed for ${platform.rustTarget}`)

  const built = join(cargoTargetDir(), platform.rustTarget, 'release', PRODUCT.binary)
  const dest = binaryPath(l, platform)
  mkdirSync(dirname(dest), { recursive: true })
  copyExecutable(built, dest)
  return dest
}

// ---------------------------------------------------------------- notices

interface AboutCrate {
  name: string
  version: string
  source: string | null
  repository?: string | null
}

export interface AboutJson {
  licenses: { name: string; id: string; text: string; used_by: { crate: AboutCrate }[] }[]
}

/**
 * Renders cargo-about's JSON. Path crates (`source: null`) are this
 * workspace's own and are left out: they ship under the binary's own license.
 */
export function renderNotices(about: AboutJson): string {
  const sections: string[] = []
  for (const license of about.licenses) {
    const users = license.used_by
      .map((u) => u.crate)
      .filter((c) => c.source !== null)
      .sort((a, b) => a.name.localeCompare(b.name))
    if (users.length === 0) continue
    const list = users
      .map((c) => `- ${c.name} ${c.version}${c.repository ? ` (${c.repository})` : ''}`)
      .join('\n')
    sections.push(
      `## ${license.name} (${license.id})\n\nUsed by:\n\n${list}\n\n\`\`\`text\n${license.text.trimEnd()}\n\`\`\``,
    )
  }
  return [
    '# Third-party notices',
    '',
    `The ${PRODUCT.binary} binary includes the open-source Rust crates below. Each is listed with`,
    "the license it is used under and that license's text.",
    '',
    sections.join('\n\n'),
    '',
  ].join('\n')
}

function notices(l: Layout): string {
  const scratch = mkdtempSync(join(tmpdir(), 'tradecraft-about-'))
  const json = join(scratch, 'about.json')
  runChecked(
    'cargo',
    [
      'about',
      'generate',
      '--format',
      'json',
      '-c',
      join(HERE, 'about.toml'),
      '-m',
      CRATE_MANIFEST,
      '-o',
      json,
    ],
    { cwd: WORKSPACE },
  )
  mkdirSync(dirname(l.notices), { recursive: true })
  writeFileSync(l.notices, renderNotices(readJson<AboutJson>(json)))
  rmSync(scratch, { recursive: true, force: true })
  return l.notices
}

// ---------------------------------------------------------------- assemble

function copyCommon(dir: string, l: Layout): void {
  for (const file of LICENSES) copyFileSync(join(CRATE_DIR, file), join(dir, file))
  if (!existsSync(l.notices)) throw new Error(`${l.notices} is missing; run the notices verb first`)
  copyFileSync(l.notices, join(dir, NOTICES))
}

type Manifest = Record<string, unknown>

/**
 * One platform package, gated by `os`/`cpu` so npm installs it only on a
 * matching host. Template fields keep their position; the fields set here
 * that the template does not name are appended.
 */
export function platformManifest(platform: Platform, version: string): Manifest {
  const m: Manifest = {
    name: platformPackageName(platform),
    version,
    description: `The ${PRODUCT.binary} binary for ${platform.os} ${platform.cpu}. Install ${PRODUCT.launcher} instead.`,
  }
  Object.assign(m, readTemplate('platform'))
  m['os'] = [platform.os]
  m['cpu'] = [platform.cpu]
  // Keeps the binary a real file under Yarn PnP, so the launcher can exec it.
  m['preferUnplugged'] = true
  return m
}

/**
 * The launcher package. Lists every platform package as an optional
 * dependency at the same version. No `type` field: the launcher is CommonJS.
 */
export function launcherManifest(version: string): Manifest {
  const m: Manifest = { name: PRODUCT.launcher, version, description: PRODUCT.description }
  Object.assign(m, readTemplate('launcher'))
  m['bin'] = { [PRODUCT.binary]: 'bin/launcher.js' }
  m['optionalDependencies'] = Object.fromEntries(
    PLATFORMS.map((p) => [platformPackageName(p), version]),
  )
  return m
}

/** The launcher script, with its platform table filled in. */
export function renderLauncher(): string {
  const table = Object.fromEntries(
    PLATFORMS.map((p) => [
      platformKey(p),
      { package: platformPackageName(p), binary: binaryPathInPackage() },
    ]),
  )
  return fill(readFileSync(join(HERE, 'launcher.js'), 'utf8'), {
    platformPackages: JSON.stringify(table),
    binary: PRODUCT.binary,
    launcher: PRODUCT.launcher,
    debugEnv: 'TRADECRAFT_LAUNCHER_DEBUG',
  })
}

function assemble(l: Layout, version: string, allowMissing: boolean): string[] {
  rmSync(l.packages, { recursive: true, force: true })
  const dirs: string[] = []
  const shared = {
    launcher: PRODUCT.launcher,
    binary: PRODUCT.binary,
    scope: PRODUCT.scope,
    platformPrefix: PRODUCT.platformPrefix,
    description: PRODUCT.description,
    platforms: PLATFORMS.map(platformKey).join(', '),
  }

  for (const platform of PLATFORMS) {
    const binary = binaryPath(l, platform)
    if (!existsSync(binary)) {
      if (allowMissing) continue
      throw new Error(`missing binary for ${platformKey(platform)} under ${l.binaries}`)
    }
    const dir = join(l.packages, platformKey(platform))
    mkdirSync(join(dir, PRODUCT.binaryDir), { recursive: true })
    copyExecutable(binary, join(dir, binaryPathInPackage()))
    writeJson(join(dir, 'package.json'), platformManifest(platform, version))
    writeFileSync(
      join(dir, 'README.md'),
      fill(readFileSync(join(TEMPLATES, 'platform/README.md'), 'utf8'), {
        ...shared,
        name: platformPackageName(platform),
        os: platform.os,
        cpu: platform.cpu,
      }),
    )
    copyCommon(dir, l)
    dirs.push(dir)
  }

  const dir = join(l.packages, 'launcher')
  mkdirSync(join(dir, 'bin'), { recursive: true })
  writeFileSync(join(dir, 'bin/launcher.js'), renderLauncher())
  chmodSync(join(dir, 'bin/launcher.js'), 0o755)
  writeJson(join(dir, 'package.json'), launcherManifest(version))
  writeFileSync(
    join(dir, 'README.md'),
    fill(readFileSync(join(TEMPLATES, 'launcher/README.md'), 'utf8'), shared),
  )
  copyCommon(dir, l)
  dirs.push(dir)
  return dirs
}

/** Package dirs in publish order: platform packages before the launcher that depends on them. */
function packageDirs(l: Layout): string[] {
  if (!existsSync(l.packages)) {
    throw new Error(`${l.packages} is missing; run the assemble verb first`)
  }
  const names = readdirSync(l.packages)
    .filter((n) => n !== 'launcher')
    .sort()
  return [...names, 'launcher'].map((n) => join(l.packages, n))
}

// ---------------------------------------------------------------- pack / publish

/** Packs every package in one npm call; returns the tarball paths. */
function pack(l: Layout): string[] {
  rmSync(l.tarballs, { recursive: true, force: true })
  mkdirSync(l.tarballs, { recursive: true })
  const dirs = packageDirs(l)
  const result = runChecked('npm', ['pack', '--json', '--pack-destination', l.tarballs, ...dirs], {
    cwd: l.packages,
  })
  const entries = JSON.parse(result.stdout) as { name: string; filename: string }[]
  if (entries.length !== dirs.length) {
    throw new Error(`npm pack packed ${entries.length} packages, expected ${dirs.length}`)
  }
  return entries.map((e) => join(l.tarballs, e.filename))
}

/** The file name `npm pack` gives a package: scope `@` dropped, `/` becomes `-`. */
export function npmTarballName(name: string, version: string): string {
  return `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`
}

/** The dist-tag a version publishes under: a pre-release goes to `next`, not `latest`. */
export function distTag(version: string): string {
  return version.includes('-') ? 'next' : 'latest'
}

function isPublished(name: string, version: string): boolean {
  const r = run('npm', ['view', `${name}@${version}`, 'version'])
  return r.status === 0 && r.stdout.trim() === version
}

/**
 * Publishes platform packages first, the launcher last, so its optional
 * dependencies are on the registry when it lands. A version the registry
 * already has is skipped, so a half-finished run is safe to re-run. Auth and
 * provenance come from the environment (trusted publishing in CI).
 */
function publish(l: Layout, dryRun: boolean): void {
  for (const dir of packageDirs(l)) {
    const { name, version } = readJson<{ name: string; version: string }>(join(dir, 'package.json'))
    if (isPublished(name, version)) {
      console.log(`${name}@${version} is already published; skipping`)
      continue
    }
    const argv = [
      'publish',
      '--access',
      'public',
      '--tag',
      distTag(version),
      ...(dryRun ? ['--dry-run'] : []),
    ]
    console.log(`${name}@${version}: npm ${argv.join(' ')}`)
    if (run('npm', argv, { cwd: dir, stream: true }).status !== 0) {
      throw new Error(`npm ${argv.join(' ')} failed in ${dir}`)
    }
  }
}

// ---------------------------------------------------------------- release assets

/** The `SHA256SUMS` line format `sha256sum -c` reads. */
export function sumsLine(bytes: Uint8Array, name: string): string {
  return `${createHash('sha256').update(bytes).digest('hex')}  ${name}`
}

function releaseAssets(l: Layout, version: string): string[] {
  rmSync(l.release, { recursive: true, force: true })
  mkdirSync(l.release, { recursive: true })
  const sums: string[] = []
  const files: string[] = []
  for (const platform of PLATFORMS) {
    const binary = binaryPath(l, platform)
    if (!existsSync(binary)) {
      throw new Error(`missing binary for ${platformKey(platform)} under ${l.binaries}`)
    }
    const bytes = readFileSync(binary)
    const name = releaseAssetName(platform, version)
    writeFileSync(join(l.release, name), bytes, { mode: 0o755 })
    sums.push(sumsLine(bytes, name))
    files.push(join(l.release, name))
  }
  copyFileSync(l.notices, join(l.release, NOTICES))
  for (const file of LICENSES) copyFileSync(join(CRATE_DIR, file), join(l.release, file))
  writeFileSync(join(l.release, 'install.sh'), renderInstallScript(version), { mode: 0o755 })
  writeFileSync(join(l.release, 'SHA256SUMS'), `${sums.join('\n')}\n`)
  // Used only when the workflow has to create the release itself; a release
  // made by release-plz keeps its own notes.
  writeFileSync(
    l.releaseNotes,
    `Install with \`brew install osdlc/tap/${PRODUCT.binary}\`, \`cargo binstall ${PRODUCT.crate}@${version}\`, ` +
      `\`npm install --global ${PRODUCT.launcher}@${version}\` or ` +
      `\`curl -fsSL https://github.com/${PRODUCT.repository}/releases/download/${PRODUCT.tagPrefix}${version}/install.sh | sh\`.\n\n` +
      'The binaries below are the ones the npm packages carry. Checksums are in `SHA256SUMS`. ' +
      'The macOS binaries are not signed or notarized.\n',
  )
  return [
    ...files,
    ...[NOTICES, ...LICENSES, 'install.sh', 'SHA256SUMS'].map((f) => join(l.release, f)),
  ]
}

/** install.sh with this release's version as its default, so the attached copy installs it. */
export function renderInstallScript(version: string): string {
  const script = readFileSync(join(HERE, 'install.sh'), 'utf8')
  const line = "DEFAULT_VERSION=''"
  if (!script.includes(line)) throw new Error(`install.sh has no ${line} line`)
  return script.replace(line, `DEFAULT_VERSION='${version}'`)
}

// ---------------------------------------------------------------- homebrew

/** The Homebrew formula for a release, from the hashes in its SHA256SUMS. */
export function formula(version: string, sumsText: string): string {
  const sums = parseSums(sumsText)
  return renderFormula({
    name: PRODUCT.binary,
    version,
    desc: PRODUCT.brewDescription,
    homepage: PRODUCT.homepage,
    license: PRODUCT.license,
    urlBase: `https://github.com/${PRODUCT.repository}/releases/download/${PRODUCT.tagPrefix}${version}`,
    assets: PLATFORMS.map((p) => {
      const file = releaseAssetName(p, version)
      const sha256 = sums.get(file)
      if (!sha256) throw new Error(`${file} is not in SHA256SUMS`)
      return { os: p.os, cpu: p.cpu, file, sha256 }
    }),
  })
}

// ---------------------------------------------------------------- install check / smoke

/**
 * Installs the packed launcher and this machine's platform package into a
 * scratch project, then runs the binary through `npx`.
 */
function installCheck(l: Layout, version = crateVersion(), packed?: string[]): void {
  const host = hostPlatform()
  const tarballs =
    packed ??
    [PRODUCT.launcher, platformPackageName(host)].map((name) => {
      const file = join(l.tarballs, npmTarballName(name, version))
      if (!existsSync(file)) throw new Error(`no packed tarball ${file}; run the pack verb first`)
      return file
    })

  const scratch = mkdtempSync(join(tmpdir(), 'tradecraft-smoke-'))
  writeJson(join(scratch, 'package.json'), { name: 'smoke', private: true })
  // --omit=optional: the other platforms' packages may not be on the
  // registry. This machine's tarball is installed directly instead.
  runChecked('npm', ['install', '--omit=optional', '--no-audit', '--no-fund', ...tarballs], {
    cwd: scratch,
  })

  const npx = (args: string[]): string =>
    runChecked('npx', ['--no-install', PRODUCT.binary, ...args], { cwd: scratch }).stdout

  const versionOut = npx(['--version']).trim()
  console.log(`$ npx ${PRODUCT.binary} --version\n${versionOut}`)
  if (versionOut !== `${PRODUCT.binary} ${version}`) {
    throw new Error(`--version printed "${versionOut}", expected "${PRODUCT.binary} ${version}"`)
  }
  const help = npx(['--help'])
  console.log(`$ npx ${PRODUCT.binary} --help\n${help}`)
  if (!help.includes('Usage:')) throw new Error('--help printed no usage line')
  console.log(`install check OK in ${scratch}`)
}

/** The whole path for this machine: build, notices, assemble, pack, install, run. */
function smoke(l: Layout): void {
  const host = hostPlatform()
  const version = crateVersion()
  console.log(`smoke: ${PRODUCT.launcher}@${version} on ${platformKey(host)}`)
  rmSync(l.binaries, { recursive: true, force: true })
  build(host, l)
  notices(l)
  assemble(l, version, true)
  installCheck(l, version, pack(l))
}

// ---------------------------------------------------------------- stage

/** Every npm package name the release publishes, in publish order. */
export function packageNames(): string[] {
  return [...PLATFORMS.map(platformPackageName), PRODUCT.launcher]
}

/** The placeholder package.json `stage` publishes for a name. */
export function placeholderManifest(name: string): Manifest {
  const { license, author, repository } = readTemplate('launcher')
  return {
    name,
    version: PLACEHOLDER,
    description: `Placeholder for ${name}, so its trusted publisher can be set up. Install ${PRODUCT.launcher}.`,
    license,
    author,
    repository,
  }
}

/**
 * Owner only, once: npm can add a trusted publisher only to a package that
 * exists, so each new name gets a placeholder version under the `stage` tag
 * and then a trusted publisher naming the release workflow. Skips a step that
 * is already done, so a re-run is safe. Needs an npm login as an owner of the
 * @osdlc scope and two-factor authentication. Same steps as
 * scripts/stage-npm-package.ts, which handles packages/ts/* libraries.
 */
function stage(dryRun: boolean): void {
  const npm = (args: string[], stream = false): RunResult =>
    run('npx', ['-y', STAGE_NPM, ...args], { stream })
  const dry = dryRun ? ['--dry-run'] : []
  const who = npm(['whoami'])
  if (who.status !== 0 && !dryRun)
    throw new Error(`npm whoami failed; run \`npm login\` first.\n${who.stderr}`)
  console.log(`npm user: ${who.status === 0 ? who.stdout.trim() : '(not logged in)'}`)

  const [owner, repo] = PRODUCT.repository.split('/') as [string, string]
  const trust = [
    'trust',
    'github',
    '--file',
    PRODUCT.workflow,
    '--repository',
    `${owner}/${repo}`,
    '--allow-publish',
  ]
  let failed = false
  for (const name of packageNames()) {
    console.log(`\n${name}`)
    const view = npm(['view', name, 'name'])
    const existed = view.status === 0
    if (!existed && !view.stderr.includes('E404'))
      throw new Error(`npm view ${name} failed:\n${view.stderr}`)
    if (existed) {
      console.log('  already on npm; no placeholder needed.')
      const list = npm(['trust', 'list', name, '--json'])
      if (list.status === 0 && (JSON.parse(list.stdout || '[]') as unknown[]).length > 0) {
        console.log('  already has a trusted publisher; leaving it.')
        continue
      }
    } else {
      const dir = mkdtempSync(join(tmpdir(), 'tradecraft-stage-'))
      writeJson(join(dir, 'package.json'), placeholderManifest(name))
      writeFileSync(
        join(dir, 'README.md'),
        `# ${name}\n\nPlaceholder. Install \`${PRODUCT.launcher}\`.\n`,
      )
      const publishArgs = ['publish', dir, '--access', 'public', '--tag', 'stage', ...dry]
      console.log(`  npm ${publishArgs.join(' ')}`)
      const ok = npm(publishArgs, true).status === 0
      rmSync(dir, { recursive: true, force: true })
      if (!ok) {
        console.error('  the placeholder publish failed; skipping its trusted publisher.')
        failed = true
        continue
      }
    }
    console.log(`  npm ${[...trust, name].join(' ')}`)
    // npm cannot set a trusted publisher on a package that is not on npm yet.
    if (dryRun) continue
    if (npm([...trust, name, '--yes'], true).status !== 0) {
      console.error(
        `  npm trust failed. Add it by hand at https://www.npmjs.com/package/${name}/access: ` +
          `GitHub Actions, organization ${owner}, repository ${repo}, workflow ${PRODUCT.workflow}, no environment.`,
      )
      failed = true
    }
  }
  if (failed) throw new Error('stage: some packages failed; see above')
}

// ---------------------------------------------------------------- main

function main(argv: string[]): void {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: 'string' },
      platform: { type: 'string' },
      version: { type: 'string' },
      tag: { type: 'string' },
      'allow-missing': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  })
  const l = layout(resolve(values.out ?? join(WORKSPACE, 'target', 'tradecraft-dist')))
  const verb = positionals[0]

  switch (verb) {
    case 'version': {
      const version = checkVersion(values.version)
      if (values.tag !== undefined) checkVersion(tagVersion(values.tag))
      console.log(version)
      return
    }
    case 'matrix':
      console.log(JSON.stringify(matrix()))
      return
    case 'build':
      console.log(build(values.platform ? findPlatform(values.platform) : hostPlatform(), l))
      return
    case 'notices':
      console.log(notices(l))
      return
    case 'assemble':
      for (const dir of assemble(l, checkVersion(values.version), values['allow-missing'])) {
        console.log(dir)
      }
      return
    case 'pack':
      for (const file of pack(l)) console.log(file)
      return
    case 'publish':
      publish(l, values['dry-run'])
      return
    case 'release-assets':
      for (const file of releaseAssets(l, checkVersion(values.version))) console.log(file)
      return
    case 'install-check':
      installCheck(l)
      return
    case 'smoke':
      smoke(l)
      return
    case 'formula': {
      const version = checkVersion(values.version)
      writeFileSync(
        l.formula,
        formula(version, readFileSync(join(l.release, 'SHA256SUMS'), 'utf8')),
      )
      console.log(l.formula)
      return
    }
    case 'stage':
      stage(values['dry-run'])
      return
    default:
      console.error(
        'usage: dist.ts <version|matrix|build|notices|assemble|pack|publish|release-assets|install-check|smoke|formula|stage> [--out <dir>]',
      )
      process.exit(2)
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === import.meta.filename) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
