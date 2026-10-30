// Renders a Homebrew formula for a CLI whose GitHub Release carries one bare
// binary per platform and a SHA256SUMS file. Not tied to one tool: the release
// workflow of any osdlc CLI passes its own name, version and assets. The tap is
// osdlc/homebrew-tap, so users run `brew install osdlc/tap/<name>`.
//
//   node scripts/homebrew-formula.ts --name <tool> --version <v> --desc <text>
//     --homepage <url> --license <spdx> --url-base <release download url>
//     --sums <SHA256SUMS> --asset darwin-arm64=<file> [--asset <os>-<cpu>=<file> ...]
//     [--tag-prefix <prefix>] [--out <Formula/tool.rb>]
//
// Each --asset maps a platform (darwin or linux, arm64 or x64) to the asset's
// file name on the release; its hash is read from the sums file. The formula
// installs the downloaded file as `bin/<name>` and its test runs
// `<name> --version`. With --tag-prefix, `brew livecheck` reads the GitHub
// releases whose tag starts with the prefix, so a repository that releases
// several products finds this one's. Without --out it prints the formula.
//
// With --out, a pre-release, or a version older than the one the file at --out
// already has, is skipped with a notice and the file is left as it is. So a
// late re-run of an old release cannot move the tap backwards.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

export type BrewOs = 'darwin' | 'linux'
export type BrewCpu = 'arm64' | 'x64'

export interface BrewAsset {
  os: BrewOs
  cpu: BrewCpu
  /** The asset's file name on the release. */
  file: string
  sha256: string
}

export interface FormulaInput {
  name: string
  version: string
  desc: string
  homepage: string
  /** An SPDX expression: one id, or ids joined by OR or AND. */
  license: string
  /** The release's download URL, without a trailing slash. */
  urlBase: string
  assets: readonly BrewAsset[]
  /** `brew livecheck` reads the GitHub releases whose tag starts with this prefix. */
  livecheckTagPrefix?: string
}

/** Compares two semver-like versions: release `X.Y.Z`, with an optional `-pre` part. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [main = '', pre] = v.replace(/^v/, '').split(/-(.*)/s)
    return { nums: main.split('.').map((n) => Number.parseInt(n, 10) || 0), pre }
  }
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
    if (d !== 0) return Math.sign(d)
  }
  if (x.pre === y.pre) return 0
  if (x.pre === undefined) return 1
  if (y.pre === undefined) return -1
  return x.pre < y.pre ? -1 : 1
}

/**
 * The version a formula installs: its `version` line, or else the version in
 * its first `url`, the way Homebrew reads one from a URL. Null when neither
 * gives one.
 */
export function formulaVersion(text: string): string | null {
  const explicit = /^\s*version\s+"([^"]+)"/m.exec(text)
  if (explicit) return explicit[1]!
  const url = /^\s*url\s+"([^"]+)"/m.exec(text)
  if (!url) return null
  const m = /v?(\d+(?:\.\d+)+(?:-[0-9A-Za-z.]+?)?)(?=\.tar|\.tgz|\.zip|-|\/|$)/.exec(url[1]!)
  return m ? m[1]! : null
}

/** True when Homebrew can read `version` from `url`, so a `version` line would be redundant. */
export function urlCarriesVersion(url: string, version: string): boolean {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[/_-]v?)${escaped}($|[/_-]|\\.(tar|tgz|zip))`).test(url)
}

/**
 * Whether to write `version` over the formula `current`. A pre-release, or a
 * version older than the one `current` installs, is skipped.
 */
export function replaceDecision(
  current: string | null,
  version: string,
): { replace: boolean; reason: string } {
  if (version.includes('-')) {
    return { replace: false, reason: `${version} is a pre-release; the tap carries releases only` }
  }
  const installed = current === null ? null : formulaVersion(current)
  if (installed !== null && compareVersions(installed, version) > 0) {
    return { replace: false, reason: `the tap has ${installed}, newer than ${version}` }
  }
  return { replace: true, reason: installed === null ? 'no formula yet' : `replaces ${installed}` }
}

/** `skillwright` to `Skillwright`, `repo-cleaner` to `RepoCleaner`: Homebrew's class name. */
export function className(name: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name))
    throw new Error(`formula name "${name}" must be lowercase letters, digits and dashes`)
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/** A Ruby double-quoted string literal. */
export function rubyString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/#\{/g, '\\#{')}"`
}

/** The formula's `license` line for an SPDX expression. */
export function licenseLine(spdx: string): string {
  const ids = (sep: string) => spdx.split(sep).map((id) => id.trim())
  const list = (xs: string[]) => `[${xs.map(rubyString).join(', ')}]`
  if (/\bOR\b/.test(spdx) && !/\bAND\b/.test(spdx)) return `license any_of: ${list(ids(' OR '))}`
  if (/\bAND\b/.test(spdx) && !/\bOR\b/.test(spdx)) return `license all_of: ${list(ids(' AND '))}`
  if (/\s/.test(spdx))
    throw new Error(`license "${spdx}" is not one SPDX id or a plain OR/AND list`)
  return `license ${rubyString(spdx)}`
}

/** Reads `sha256sum` output: `<hex>  <file>` per line. */
export function parseSums(text: string): Map<string, string> {
  const sums = new Map<string, string>()
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    const m = /^([0-9a-f]{64}) [ *](.+)$/.exec(line.trim())
    if (!m) throw new Error(`not a SHA256SUMS line: ${line}`)
    sums.set(m[2]!, m[1]!)
  }
  return sums
}

const OS_BLOCK: Record<BrewOs, string> = { darwin: 'on_macos', linux: 'on_linux' }
const CPU_BLOCK: Record<BrewCpu, string> = { arm64: 'on_arm', x64: 'on_intel' }

export function renderFormula(input: FormulaInput): string {
  const { name, version, desc, homepage, license, urlBase, assets, livecheckTagPrefix } = input
  // `brew audit` rules for desc.
  if (desc.length > 80) throw new Error(`desc is ${desc.length} characters; Homebrew allows 80`)
  if (/\.$/.test(desc) || /^(a|an|the)\s/i.test(desc)) {
    throw new Error('desc must not start with an article or end with a period')
  }
  if (assets.length === 0) throw new Error('no assets')
  const seen = new Set<string>()
  for (const a of assets) {
    const key = `${a.os}-${a.cpu}`
    if (seen.has(key)) throw new Error(`two assets for ${key}`)
    seen.add(key)
    if (!/^[0-9a-f]{64}$/.test(a.sha256)) throw new Error(`${a.file}: bad sha256`)
  }

  const lines: string[] = [
    `# Generated by scripts/homebrew-formula.ts in osdlc/osdlc for ${name} ${version}.`,
    '# The release workflow rewrites this file on each release; do not edit it by hand.',
    `class ${className(name)} < Formula`,
    `  desc ${rubyString(desc)}`,
    `  homepage ${rubyString(homepage)}`,
  ]
  // `brew audit` calls a `version` line redundant when every URL carries it.
  if (!assets.every((a) => urlCarriesVersion(`${urlBase}/${a.file}`, version))) {
    lines.push(`  version ${rubyString(version)}`)
  }
  lines.push(`  ${licenseLine(license)}`)
  if (livecheckTagPrefix !== undefined) {
    const prefix = livecheckTagPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    lines.push(
      '',
      '  livecheck do',
      '    url :stable',
      `    regex(%r{^${prefix}(\\d+(?:\\.\\d+)+)$}i)`,
      '    strategy :github_releases',
      '  end',
    )
  }
  for (const os of ['darwin', 'linux'] as const) {
    const forOs = assets.filter((a) => a.os === os)
    if (forOs.length === 0) continue
    const blocks = (['arm64', 'x64'] as const).flatMap((cpu) => {
      const a = forOs.find((x) => x.cpu === cpu)
      if (!a) return []
      return [
        [
          `    ${CPU_BLOCK[cpu]} do`,
          `      url ${rubyString(`${urlBase}/${a.file}`)}`,
          `      sha256 ${rubyString(a.sha256)}`,
          '    end',
        ].join('\n'),
      ]
    })
    lines.push('', `  ${OS_BLOCK[os]} do`, blocks.join('\n\n'), '  end')
  }
  lines.push(
    '',
    '  def install',
    '    # The download is the bare binary, staged under its asset name.',
    `    bin.install File.basename(stable.url) => ${rubyString(name)}`,
    '  end',
    '',
    '  test do',
    `    assert_match version.to_s, shell_output("#{bin}/${name} --version")`,
    '  end',
    'end',
    '',
  )
  return lines.join('\n')
}

/**
 * Writes `formula` to `path` unless replaceDecision says to keep the file
 * there. Returns whether it wrote, and prints the reason either way.
 */
export function writeFormula(path: string, version: string, formula: string): boolean {
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null
  const { replace, reason } = replaceDecision(current, version)
  if (!replace) {
    console.log(`::notice::Homebrew formula left as it is: ${reason}`)
    return false
  }
  writeFileSync(path, formula)
  console.log(`${path}: ${version} (${reason})`)
  return true
}

/** `darwin-arm64=tool-1.0.0-aarch64-apple-darwin` to its platform and file. */
export function parseAssetFlag(flag: string): { os: BrewOs; cpu: BrewCpu; file: string } {
  const m = /^(darwin|linux)-(arm64|x64)=(.+)$/.exec(flag)
  if (!m) throw new Error(`--asset ${flag}: expected <darwin|linux>-<arm64|x64>=<file>`)
  return { os: m[1] as BrewOs, cpu: m[2] as BrewCpu, file: m[3]! }
}

function main(): void {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      version: { type: 'string' },
      desc: { type: 'string' },
      homepage: { type: 'string' },
      license: { type: 'string' },
      'url-base': { type: 'string' },
      sums: { type: 'string' },
      asset: { type: 'string', multiple: true },
      'tag-prefix': { type: 'string' },
      out: { type: 'string' },
    },
  })
  const need = (key: keyof typeof values): string => {
    const v = values[key]
    if (typeof v !== 'string' || v === '') throw new Error(`--${key} is required`)
    return v
  }
  const sums = parseSums(readFileSync(need('sums'), 'utf8'))
  const assets = (values.asset ?? []).map((flag) => {
    const a = parseAssetFlag(flag)
    const sha256 = sums.get(a.file)
    if (!sha256) throw new Error(`${a.file} is not in ${values.sums}`)
    return { ...a, sha256 }
  })
  const tagPrefix = values['tag-prefix']
  const formula = renderFormula({
    name: need('name'),
    version: need('version'),
    desc: need('desc'),
    homepage: need('homepage'),
    license: need('license'),
    urlBase: need('url-base').replace(/\/+$/, ''),
    assets,
    ...(tagPrefix ? { livecheckTagPrefix: tagPrefix } : {}),
  })
  if (values.out) writeFormula(values.out, need('version'), formula)
  else process.stdout.write(formula)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
