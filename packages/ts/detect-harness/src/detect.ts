/**
 * `detect()`: run the providers and assemble the {@link HarnessCatalog}.
 *
 * Every call reads afresh; nothing is cached between calls. Providers run
 * concurrently, and one that throws becomes an `error` report without losing
 * the others.
 *
 * The install probe is done here, not by the provider: the declared binary is
 * looked up on `PATH` (no subprocess), then the app bundles are checked. Only
 * with `allowExec` does it run `<binary> --version`, for at most 3 seconds.
 */

import { homedir } from 'node:os'
import { resolve } from 'node:path'

import { ran, spawnRunnerAsync } from '@osdlc/command-seam'

import { createContext, forHarness } from './context.ts'
import type { DetectOptions, HarnessProvider, ProviderContext } from './contract.ts'
import { harnessId } from './harnesses.ts'
import { errorMessage } from './json.ts'
import { defaultSystemRoot, resolveTemplate } from './locations.ts'
import { builtinProviders } from './providers/index.ts'
import { unknownAuth } from './read/auth.ts'
import type { Diagnostic, HarnessCatalog, HarnessReport, Install } from './report.ts'
import { which as whichOnPath } from './which.ts'

/** Milliseconds `--version` may take before the install is reported without a version. */
const VERSION_TIMEOUT_MS = 3_000

/** The first semver-shaped token in `text` (`2.1.283`, `0.156.1-beta.2`), or `null`. */
export function parseVersion(text: string): string | null {
  return /\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/.exec(text)?.[0] ?? null
}

/** The providers one call runs, after `only` and `exclude`. */
export function selectProviders(options: DetectOptions): readonly HarnessProvider[] {
  let providers = options.providers ?? builtinProviders
  if (options.only) {
    const wanted = new Set(options.only)
    providers = providers.filter((p) => wanted.has(p.id))
  }
  if (options.exclude) {
    const unwanted = new Set(options.exclude)
    providers = providers.filter((p) => !unwanted.has(p.id))
  }
  return providers
}

function notProbed(binary: string | null): Install {
  return { binary, probed: false, found: false, path: null, how: null, version: null }
}

async function probeInstall(
  ctx: ProviderContext,
  provider: HarnessProvider,
  binary: string | null,
): Promise<Install> {
  if (ctx.mode === 'project') return notProbed(binary)
  const none: Install = { ...notProbed(binary), probed: true }
  const onPath = binary === null ? null : ctx.which(binary)
  if (onPath !== null) {
    const found: Install = { ...none, found: true, path: onPath, how: 'PATH' }
    if (!ctx.allowExec) return found
    const res = await ctx.runner(onPath).run(['--version'], {
      cwd: ctx.projectRoot,
      timeoutMs: VERSION_TIMEOUT_MS,
      signal: ctx.signal,
    })
    return { ...found, version: ran(res) ? parseVersion(res.stdout || res.stderr) : null }
  }
  // A custom provider's templates may use `~`, `{system}` and `{project}`, not a harness base.
  const id = harnessId(provider.id) ?? null
  for (const t of provider.appBundles ?? []) {
    const path = resolveTemplate(id, t, ctx)
    if (path !== null && ctx.isDirectory(path)) {
      return { ...none, found: true, path, how: 'app bundle' }
    }
  }
  return none
}

function emptyReport(provider: HarnessProvider, install: Install): HarnessReport {
  return {
    harness: provider.id,
    label: provider.label,
    status: 'absent',
    install,
    configDirs: [],
    sources: [],
    plugins: [],
    marketplaces: [],
    skills: [],
    commands: [],
    agents: [],
    hooks: [],
    mcpServers: [],
    permissions: { rules: [], defaultMode: null, defaultModeSource: null },
    instructions: [],
    auth: unknownAuth(),
    diagnostics: [],
    skippedForExec: false,
  }
}

async function runProvider(
  shared: ProviderContext,
  provider: HarnessProvider,
  binaries: Readonly<Record<string, string>>,
): Promise<HarnessReport> {
  const ctx = forHarness(shared, provider.id)
  const binary = binaries[provider.id] ?? provider.binary ?? null
  // A failed probe is reported, and the files are still read.
  let install: Install
  const probeNotes: Diagnostic[] = []
  try {
    install = await probeInstall(ctx, provider, binary)
  } catch (err) {
    install = { ...notProbed(binary), probed: true }
    probeNotes.push({
      severity: 'warning',
      message: `install probe failed: ${errorMessage(err)}`,
      source: null,
    })
  }
  const base = { ...emptyReport(provider, install), diagnostics: probeNotes }

  if (provider.kind === 'exec' && !ctx.allowExec) {
    return {
      ...base,
      skippedForExec: true,
      diagnostics: [
        ...probeNotes,
        {
          severity: 'info',
          message: `${provider.id} needs to run a program; run with allowExec to include it`,
          source: null,
        },
      ],
    }
  }

  try {
    const result = await provider.collect(ctx)
    const report: HarnessReport = {
      ...base,
      ...result,
      install,
      diagnostics: [...probeNotes, ...(result.diagnostics ?? [])],
      skippedForExec: false,
    }
    if (result.status === undefined) {
      const found =
        install.found ||
        report.configDirs.some((d) => d.exists) ||
        report.sources.some((s) => s.status === 'parsed')
      report.status = found ? 'ok' : 'absent'
    }
    return report
  } catch (err) {
    return {
      ...base,
      status: 'error',
      diagnostics: [...probeNotes, { severity: 'error', message: errorMessage(err), source: null }],
    }
  }
}

/**
 * Detect the harnesses on this machine and in this project.
 *
 * Read-only: nothing is written, and nothing is run unless `allowExec` is set.
 * MCP secret values (`env`, headers, URL credentials, secret-looking `args`) are
 * redacted unless `includeValues` is set.
 */
export async function detect(options: DetectOptions = {}): Promise<HarnessCatalog> {
  const mode = options.mode ?? 'full'
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const projectRoot = resolve(options.projectRoot ?? process.cwd())
  const home = mode === 'project' ? null : resolve(options.home ?? homedir())
  const allowExec = options.allowExec ?? false

  const ctx = createContext({
    projectRoot,
    home,
    env,
    platform,
    systemRoot: options.systemRoot ?? defaultSystemRoot(platform, env),
    mode,
    allowExec,
    readContents: options.readContents ?? false,
    includeValues: options.includeValues ?? false,
    which: options.which ?? ((binary) => whichOnPath(binary, env, platform)),
    // `--version` runs in the project, so a bare name runs only from an absolute PATH entry.
    makeRunner:
      options.makeRunner ?? ((binary) => spawnRunnerAsync(binary, { absolutePathOnly: true })),
    signal: options.signal ?? new AbortController().signal,
  })

  const reports = await Promise.all(
    selectProviders(options).map((p) => runProvider(ctx, p, options.binaries ?? {})),
  )
  return {
    generatedAt: new Date().toISOString(),
    projectRoot,
    home,
    mode,
    allowExec,
    reports,
  }
}
