/**
 * The CLI: the three commands' work, as functions of the parsed flags, the command tree over them
 * (`createApp`) and `runCli`, which runs the tree in-process. Each command returns the exit code
 * and the output. None exits the process or writes to the real streams. `./bin.ts` does that.
 *
 * `validate`, `init` and `migrate` are declared on `@osdlc/cli-tool`'s command model. They are
 * interactive commands: each prints its own text (`--format human|json|sarif` for `validate`), so
 * they have no `--json` or `--output` form. `markdown-contract` alone prints the command list on
 * stderr and exits 2.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import { captureContext, type FlagSpec } from '@osdlc/cli-tool'
import { type App, type CommandContext, defineApp, defineCommand } from '@osdlc/cli-tool/command'
import { stringify as stringifyYaml } from 'yaml'

import {
  compileContractObject,
  type InferOptions,
  type InferResult,
  type InferredContract,
  type InferredFile,
  inferConfig,
  loadConfigFile,
  loadContractFile,
} from '../declarative/index.js'
import { assertLoads, isVersion2, migrateV1ToV2 } from '../declarative/migrate.js'
import { type CorpusConfig, runCorpus } from '../runner/index.js'
import { formatHuman, formatJson, formatRunSummary, formatSarif } from './format.js'
import { VERSION } from './version.generated.js'

/** One rule of a `CorpusConfig`: `include` and `exclude` globs and a contract. */
type Rule = CorpusConfig['rules'][number]

const DEFAULT_CONFIG_NAMES = [
  'markdown-contract.config.js',
  'markdown-contract.config.mjs',
  'markdown-contract.config.yaml',
  'markdown-contract.config.yml',
  'markdown-contract.yaml',
  'markdown-contract.yml',
]
const VALID_FORMATS = new Set(['human', 'json', 'sarif'])

/**
 * What `runCli` returns: the exit code and the text the command would print.
 *
 * @experimental The CLI may change in a minor release.
 */
export interface CliResult {
  /** `0` success, `1` an error-level finding, `2` a usage or config error. */
  code: number
  /** What the command prints to standard output, without a final newline. */
  stdout: string
  /** What the command prints to standard error, without a final newline. */
  stderr: string
}

/** The parsed flags of `validate`, `init` and `migrate`, as `commands.ts` declares them. */
export type CliValues = ValidateFlags & InitFlags & { write?: boolean | undefined }

/** The flags `validate` reads. */
export interface ValidateFlags {
  format?: string | undefined
  config?: string | undefined
  contract?: string[] | undefined
  path?: string[] | undefined
  glob?: string[] | undefined
  include?: string[] | undefined
  exclude?: string[] | undefined
}

/**
 * `markdown-contract validate <path>`: finds the run folder and the `CorpusConfig`, runs it and
 * formats the findings. `--contract` and `--config` both become one `CorpusConfig` for
 * `runCorpus`. Exit codes: `0` or `1` from `runCorpus`, `2` for a usage or config error.
 */
export async function runValidate(
  cwd: string,
  rest: string[],
  values: CliValues,
): Promise<CliResult> {
  if (rest.length > 1) {
    return {
      code: 2,
      stdout: '',
      stderr: `markdown-contract: validate takes one <path> (got ${rest.length})`,
    }
  }
  const format = values.format ?? 'human'
  const pathArg = rest[0]
  const contracts = values.contract ?? []
  const paths = values.path ?? []

  const argError = validateRunArgs(format, contracts, paths, values.config)
  if (argError) return argError

  const resolved = await resolveRunConfig(cwd, values.config, contracts, paths, pathArg)
  if ('error' in resolved) return resolved.error
  const { config, runRoot } = resolved

  if (!existsSync(runRoot)) {
    return {
      code: 2,
      stdout: '',
      stderr: `markdown-contract: path not found: ${pathArg ?? runRoot}`,
    }
  }
  // The runner walks a folder. A file would fail inside it with a raw ENOTDIR.
  if (!statSync(runRoot).isDirectory()) {
    return {
      code: 2,
      stdout: '',
      stderr: `markdown-contract: validate <path> must be a folder, not a file: ${pathArg ?? runRoot}`,
    }
  }

  // The run's own globs (relative to the run folder), applied in every mode, `--config` too.
  // `--glob` is another name for `--include`.
  const include = [...(values.glob ?? []), ...(values.include ?? [])]
  const exclude = values.exclude ?? []

  const ran = runCorpusGuarded(config, runRoot, include, exclude)
  if ('error' in ran) return ran.error

  return {
    code: ran.result.exitCode,
    stdout: formatOutput(format, ran.result, config),
    stderr: '',
  }
}

/**
 * The usage checks for `validate`: an unknown `--format`, `--contract` with `--config`, or
 * `--path` with no `--contract`. Returns the `code: 2` result, or `null` when the flags are
 * fine. The contracts come from `--contract` (no config file) or from `--config`, never both.
 */
function validateRunArgs(
  format: string,
  contracts: string[],
  paths: string[],
  config: string | undefined,
): CliResult | null {
  if (!VALID_FORMATS.has(format)) {
    return {
      code: 2,
      stdout: '',
      stderr: `markdown-contract: unknown --format "${format}" (expected human|json|sarif)`,
    }
  }
  if (contracts.length > 0 && config !== undefined) {
    return {
      code: 2,
      stdout: '',
      stderr: `markdown-contract: use either --contract or --config, not both`,
    }
  }
  if (contracts.length === 0 && paths.length > 0) {
    return {
      code: 2,
      stdout: '',
      stderr: `markdown-contract: --path requires a matching --contract`,
    }
  }
  return null
}

/**
 * Finds the run folder (the runner's cwd) and the `CorpusConfig`. `--contract` builds the config
 * directly. Otherwise the config file is loaded. A throw from either (such as a bad or missing
 * config) becomes a `code: 2` result.
 */
async function resolveRunConfig(
  cwd: string,
  configFlag: string | undefined,
  contracts: string[],
  paths: string[],
  pathArg: string | undefined,
): Promise<{ config: CorpusConfig; runRoot: string } | { error: CliResult }> {
  try {
    if (contracts.length > 0) {
      return buildInlineConfig(cwd, contracts, paths, pathArg)
    }
    const runRoot = pathArg ? resolve(cwd, pathArg) : cwd
    return { config: await loadConfig(cwd, configFlag), runRoot }
  } catch (err) {
    return {
      error: { code: 2, stdout: '', stderr: `markdown-contract: ${(err as Error).message}` },
    }
  }
}

/**
 * Runs `runCorpus`. A throw inside it (such as a contract that throws) becomes a `code: 2`
 * result, since for the CLI it is a config problem, not a crash.
 */
function runCorpusGuarded(
  config: CorpusConfig,
  runRoot: string,
  include: string[],
  exclude: string[],
): { result: ReturnType<typeof runCorpus> } | { error: CliResult } {
  try {
    return {
      result: runCorpus(config, {
        cwd: runRoot,
        ...(include.length > 0 ? { include } : {}),
        ...(exclude.length > 0 ? { exclude } : {}),
      }),
    }
  } catch (err) {
    return {
      error: { code: 2, stdout: '', stderr: `markdown-contract: ${(err as Error).message}` },
    }
  }
}

/**
 * Formats the findings in the chosen `format`. The human format puts the run summary (totals and
 * per-contract counts) above the report. `json` and `sarif` have no summary.
 */
function formatOutput(
  format: string,
  result: ReturnType<typeof runCorpus>,
  config: CorpusConfig,
): string {
  if (format === 'json') return formatJson(result.findings)
  if (format === 'sarif') return formatSarif(result.findings)
  return `${formatRunSummary(
    result.stats,
    config.rules.map((r) => r.name),
  )}\n\n${formatHuman(result.findings)}`
}

/**
 * `markdown-contract migrate <file>…` rewrites YAML contracts and configs from `mcVersion: 1` to
 * `mcVersion: 2`. It prints each result to stdout, or with `--write` rewrites each file in place.
 * With several files and no `--write`, each document follows a `---` line and a `# <file>` line.
 * Warnings go to stderr.
 *
 * A result that version 2 cannot load is reported and not printed or written. A file that cannot
 * be read, or is not a version 1 document, is also reported and skipped. The exit code is then 2.
 * A file that is already version 2 is noted on stderr and does not change the exit code.
 */
export function runMigrate(cwd: string, files: string[], write: boolean): CliResult {
  if (files.length === 0) {
    return {
      code: 2,
      stdout: '',
      stderr: `markdown-contract: migrate needs at least one <file>`,
    }
  }
  const stdout: string[] = []
  const stderr: string[] = []
  let failed = false
  for (const file of files) {
    const abs = resolve(cwd, file)
    try {
      const text = readFileSync(abs, 'utf8')
      if (isVersion2(text)) {
        stderr.push(`${file}: already version 2`)
        continue
      }
      const { out, warnings } = migrateV1ToV2(text, file)
      for (const w of warnings) stderr.push(`warn: ${w}`)
      try {
        assertLoads(out)
      } catch (err) {
        throw new Error(`${file}: the migrated file does not load: ${(err as Error).message}`)
      }
      if (write) {
        writeFileSync(abs, out)
        stdout.push(`migrated: ${file}`)
      } else {
        const body = out.endsWith('\n') ? out.slice(0, -1) : out
        stdout.push(files.length > 1 ? `---\n# ${file}\n${body}` : body)
      }
    } catch (err) {
      failed = true
      stderr.push(`markdown-contract: ${(err as Error).message}`)
    }
  }
  return { code: failed ? 2 : 0, stdout: stdout.join('\n'), stderr: stderr.join('\n') }
}

/** The flags `runInit` reads. */
export interface InitFlags {
  meta?: boolean | undefined
  depth?: string | undefined
  relax?: boolean | undefined
  inline?: boolean | undefined
  out?: string | undefined
  force?: boolean | undefined
  'dry-run'?: boolean | undefined
  check?: boolean | undefined
  'max-const-len'?: string | undefined
  'min-const-examples'?: string | undefined
  glob?: string[] | undefined
  include?: string[] | undefined
  exclude?: string[] | undefined
}

/** The config file name `init` writes and `--check` loads. */
const INIT_CONFIG_NAME = 'markdown-contract.yaml'

/**
 * `markdown-contract init <dir>…`: infers a config from existing markdown with `inferConfig`,
 * writes it and checks it.
 *
 * Inference is in `../declarative/infer`. This command does the rest:
 *  - Scope: `--include`, `--exclude` and `--glob` choose the files, as for `validate`. The same
 *    globs apply to the self-check.
 *  - `--dry-run`: print the files to stdout and write nothing (exit 0).
 *  - Write: otherwise write `result.files` under `--out`. The default is the one root, so
 *    `init <dir> --check` finds the config from any cwd and `validate` finds it when run inside
 *    `<dir>`. With several roots there is no one base, so it uses cwd and warns on stderr. It
 *    refuses to overwrite any existing file it would write (the config or a contract) without
 *    `--force` (exit 2). Single-contract mode
 *    also writes a `markdown-contract.yaml` config, which `validate` loads when run inside
 *    `<dir>` or given `--config <dir>/markdown-contract.yaml`.
 *  - Self-check: after writing, compile each root's inferred contracts in memory with
 *    `compileContractObject` and run them over that root with `runCorpus`. The written YAML is
 *    not reloaded. An error-level finding means inference has a bug, and exits 1.
 *  - `--check`: do not infer or write. Load the existing config and run it over the files. Exit 0
 *    when clean, 1 on any error-level finding. Use it in CI to catch drift.
 *
 * Several roots run together. Each root is inferred and self-checked on its own files (globs are
 * relative to the root, so each root's contracts run with that root as cwd). In single-contract
 * mode the written config lists every root's contract, each rule's globs prefixed with the
 * root's path from the output folder. In `--meta` mode the first root's file
 * wins at each path, so later roots' configs are dropped. A summary (groups, files, warnings, self-check) goes to stdout.
 * Usage and config errors exit 2.
 */
export function runInit(cwd: string, roots: string[], flags: InitFlags): CliResult {
  if (roots.length === 0) {
    return {
      code: 2,
      stdout: '',
      stderr: `markdown-contract: init needs at least one <dir>`,
    }
  }

  // --depth, --max-const-len and --min-const-examples must be integers. A bad value is a usage error.
  const nums = parseInitNumericFlags(flags)
  if ('error' in nums) return nums.error

  const scope = buildInitScope(flags)

  const absRoots = roots.map((r) => (isAbsolute(r) ? r : resolve(cwd, r)))
  const rootsError = checkRootsExist(absRoots)
  if (rootsError) return rootsError

  const { outDir, warning: multiRootWarning } = resolveInitOutDir(flags, cwd, absRoots)

  // --check: run the existing config over the roots. Never infer or write.
  if (flags.check === true) {
    return runInitCheck(absRoots, scope)
  }

  const opts = buildInferOptions(flags, scope, nums)

  // Infer one result per root, then merge them into the files to write.
  const inferred = inferAll(absRoots, opts)
  if ('error' in inferred) return inferred.error
  const results = inferred.results

  const files = mergeFiles(results, opts, outDir, absRoots)

  // --dry-run: print the files and write nothing.
  if (flags['dry-run'] === true) {
    return { code: 0, stdout: renderDryRun(files, results), stderr: '' }
  }

  const writeError = writeInitFiles(files, outDir, flags.force === true)
  if (writeError) return writeError

  // Self-check: compile each root's inferred contracts in memory and run them over that root.
  const selfCheckErrors = selfCheck(results, absRoots, scope)

  const summary = renderSummary(results, files, selfCheckErrors)
  // A self-check failure means inference has a bug, so exit 1. The several-roots warning (empty
  // otherwise) goes to stderr either way.
  return selfCheckErrors.length > 0
    ? { code: 1, stdout: summary, stderr: multiRootWarning }
    : { code: 0, stdout: summary, stderr: multiRootWarning }
}

/** The parsed number flags of `init`. */
interface InitNumericFlags {
  depth?: number
  maxConstStringLength?: number
  minConstExamples?: number
}

/**
 * Parses `--depth`, `--max-const-len` and `--min-const-examples` (each an optional integer with a
 * lower bound). Returns the values, or the `code: 2` usage error for the first bad flag.
 */
function parseInitNumericFlags(flags: InitFlags): InitNumericFlags | { error: CliResult } {
  const depth = parseIntFlag(
    flags.depth,
    0,
    (raw) => `markdown-contract: --depth must be a non-negative integer (got '${raw}')`,
  )
  if ('error' in depth) return depth
  const maxLen = parseIntFlag(
    flags['max-const-len'],
    0,
    (raw) => `markdown-contract: --max-const-len must be a non-negative integer (got '${raw}')`,
  )
  if ('error' in maxLen) return maxLen
  const minEx = parseIntFlag(
    flags['min-const-examples'],
    1,
    (raw) => `markdown-contract: --min-const-examples must be an integer >= 1 (got '${raw}')`,
  )
  if ('error' in minEx) return minEx
  return {
    ...(depth.value !== undefined ? { depth: depth.value } : {}),
    ...(maxLen.value !== undefined ? { maxConstStringLength: maxLen.value } : {}),
    ...(minEx.value !== undefined ? { minConstExamples: minEx.value } : {}),
  }
}

/** Parses one optional integer flag with a lower bound, or returns the `code: 2` error `message(raw)`. */
function parseIntFlag(
  raw: string | undefined,
  min: number,
  message: (raw: string) => string,
): { value: number | undefined } | { error: CliResult } {
  if (raw === undefined) return { value: undefined }
  // Plain decimal digits only. `Number` alone reads '' as 0, '1e1' as 10 and '0x2' as 2.
  const value = /^-?\d+$/.test(raw) ? Number(raw) : Number.NaN
  if (!Number.isInteger(value) || value < min) {
    return { error: { code: 2, stdout: '', stderr: message(raw) } }
  }
  return { value }
}

/** The `--glob`, `--include` and `--exclude` globs, as for `validate`. Empty lists are left out. */
function buildInitScope(flags: InitFlags): { include?: string[]; exclude?: string[] } {
  const include = [...(flags.glob ?? []), ...(flags.include ?? [])]
  const exclude = flags.exclude ?? []
  return {
    ...(include.length > 0 ? { include } : {}),
    ...(exclude.length > 0 ? { exclude } : {}),
  }
}

/** The first non-existent root as a `code: 2` error, or `null` when every root exists. */
function checkRootsExist(absRoots: string[]): CliResult | null {
  for (const root of absRoots) {
    if (!existsSync(root)) {
      return { code: 2, stdout: '', stderr: `markdown-contract: path not found: ${root}` }
    }
  }
  return null
}

/**
 * The folder to write to, and a warning for several roots. The default is the one root, so the
 * config, `contracts/` and the root-relative globs share one base. `init <dir> --check` finds
 * `<dir>/markdown-contract.yaml` from any cwd. `validate` loads the config only from the current
 * folder or from `--config`. With several roots there is no one base, so it uses cwd and warns.
 * `--out` overrides both.
 */
function resolveInitOutDir(
  flags: InitFlags,
  cwd: string,
  absRoots: string[],
): { outDir: string; warning: string } {
  const multiRootCwdFallback = !flags.out && absRoots.length > 1
  const outDir = flags.out
    ? isAbsolute(flags.out)
      ? flags.out
      : resolve(cwd, flags.out)
    : absRoots.length === 1
      ? absRoots[0]!
      : cwd
  const warning = multiRootCwdFallback
    ? 'init: multiple roots — writing the scaffold to the current directory (pass --out <dir> to choose)'
    : ''
  return { outDir, warning }
}

/** Builds the `InferOptions` from the flags, the parsed numbers and the globs. */
function buildInferOptions(
  flags: InitFlags,
  scope: { include?: string[]; exclude?: string[] },
  nums: InitNumericFlags,
): InferOptions {
  return {
    meta: flags.meta === true,
    relax: flags.relax === true,
    inline: flags.inline === true,
    ...(nums.depth !== undefined ? { depth: nums.depth } : {}),
    ...(nums.maxConstStringLength !== undefined
      ? { maxConstStringLength: nums.maxConstStringLength }
      : {}),
    ...(nums.minConstExamples !== undefined ? { minConstExamples: nums.minConstExamples } : {}),
    ...scope,
  }
}

/** One result per root, or a `code: 2` result when inference throws (such as on a heading clash). */
function inferAll(
  absRoots: string[],
  opts: InferOptions,
): { results: InferResult[] } | { error: CliResult } {
  try {
    return { results: absRoots.map((root) => inferConfig(root, opts)) }
  } catch (err) {
    return {
      error: { code: 2, stdout: '', stderr: `markdown-contract: ${(err as Error).message}` },
    }
  }
}

/**
 * Writes every inferred file under `outDir`. Without `--force` it refuses to overwrite any
 * existing file (the config or a contract file). Returns a `code: 2` result when a file exists or
 * a write fails, or `null` on success.
 */
function writeInitFiles(files: InferredFile[], outDir: string, force: boolean): CliResult | null {
  if (!force) {
    const clash = files.map((f) => resolve(outDir, f.path)).find((p) => existsSync(p))
    if (clash !== undefined) {
      return {
        code: 2,
        stdout: '',
        stderr: `markdown-contract: refusing to overwrite ${clash} (pass --force to overwrite)`,
      }
    }
  }
  try {
    for (const file of files) {
      const abs = resolve(outDir, file.path)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, file.content, 'utf8')
    }
  } catch (err) {
    return { code: 2, stdout: '', stderr: `markdown-contract: ${(err as Error).message}` }
  }
  return null
}

/**
 * `--check`: loads the existing `markdown-contract.yaml` in each root and runs it over that root.
 * No inference and no writing. Exit 0 when every root is clean, 1 on any error-level finding (a
 * doc no longer fits the inferred shape). A missing config is a usage error (exit 2).
 */
function runInitCheck(
  absRoots: string[],
  scope: { include?: string[]; exclude?: string[] },
): CliResult {
  let hadError = false
  const lines: string[] = []
  for (const root of absRoots) {
    const configPath = resolve(root, INIT_CONFIG_NAME)
    if (!existsSync(configPath)) {
      return {
        code: 2,
        stdout: '',
        stderr: `markdown-contract: no config to --check at ${configPath}`,
      }
    }
    let result: ReturnType<typeof runCorpus>
    try {
      result = runCorpus(loadConfigFile(configPath), { cwd: root, ...scope })
    } catch (err) {
      return { code: 2, stdout: '', stderr: `markdown-contract: ${(err as Error).message}` }
    }
    const errors = result.findings.filter((f) => f.level === 'error')
    if (errors.length > 0) hadError = true
    lines.push(
      `check ${root}: ${errors.length === 0 ? 'clean' : `${errors.length} error finding(s) — drifted`}`,
    )
  }
  return { code: hadError ? 1 : 0, stdout: lines.join('\n'), stderr: '' }
}

/**
 * Merges each root's `InferResult.files` into the files to write. In meta mode each root already
 * has its own `markdown-contract.yaml` and `contracts/`, so the files pass through. With several
 * roots the first root's file wins for each path, and the self-check runs on each root on its
 * own. In single-contract mode each root gives one `<name>.contract.yaml`, and this adds a
 * `markdown-contract.yaml` config that lists those contracts, so `validate` finds them when run
 * inside `<dir>`. With several roots the config sits in `outDir`, so each rule's root-relative
 * globs get the root's path from `outDir` as a prefix (`api/**\/*.md`); without it every rule
 * would match every root and send all files to the first contract. Contract names that repeat
 * across roots (`a/docs` and `b/docs`) get `-2`, `-3`, … so no contract file is overwritten.
 */
function mergeFiles(
  results: InferResult[],
  opts: InferOptions,
  outDir: string,
  absRoots: string[],
): InferredFile[] {
  if (opts.meta === true) {
    // Meta mode: keep the first file for each path.
    const seen = new Set<string>()
    const out: InferredFile[] = []
    for (const r of results) {
      for (const f of r.files) {
        if (!seen.has(f.path)) {
          seen.add(f.path)
          out.push(f)
        }
      }
    }
    return out
  }

  // Single mode: each root's contract file, plus a config that lists them all.
  const contracts: InferredContract[] = []
  const files: InferredFile[] = []
  const taken = new Set<string>()
  results.forEach((r, i) => {
    const prefix = results.length > 1 ? rootGlobPrefix(outDir, absRoots[i]!) : ''
    for (const c of r.contracts) {
      let name = c.name
      for (let n = 2; taken.has(name); n++) name = `${c.name}-${n}`
      taken.add(name)
      const file = r.files.find((f) => f.path === `${c.name}.contract.yaml`)
      if (file) files.push({ path: `${name}.contract.yaml`, content: file.content })
      contracts.push({ ...c, name, include: c.include.map((g) => `${prefix}${g}`) })
    }
  })
  const registry: Record<string, string> = {}
  for (const c of contracts) registry[c.name] = `./${c.name}.contract.yaml`
  const router = {
    mcVersion: 2,
    kind: 'config',
    contracts: registry,
    rules: contracts.map((c) => ({ include: c.include, contract: c.name })),
  }
  return [{ path: INIT_CONFIG_NAME, content: stringifyYaml(router) }, ...files]
}

/**
 * The glob prefix (`api/`) for a root's rules in a config written to `outDir`: the root's path
 * from `outDir`, with `/` separators. Empty when the root is `outDir` itself, or not inside it
 * (a glob cannot reach a folder above the run folder).
 */
function rootGlobPrefix(outDir: string, absRoot: string): string {
  const rel = relative(outDir, absRoot)
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return ''
  return `${rel.split(sep).join('/')}/`
}

/**
 * Checks the written contracts: compiles each root's contracts and runs them over that root with
 * `runCorpus`. Each root is its own cwd, so the root-relative globs match the files inference
 * saw. Returns the error-level findings as text. Any entry means an inferred rule is stricter
 * than the files allow, which is a bug in inference.
 */
function selfCheck(
  results: InferResult[],
  absRoots: string[],
  scope: { include?: string[]; exclude?: string[] },
): string[] {
  const errors: string[] = []
  results.forEach((r, i) => {
    const root = absRoots[i]!
    // Compile each contract on its own, so a build error (such as contract/key-collision) is
    // reported as a self-check failure naming the contract and its globs, not an uncaught throw.
    const rules: CorpusConfig['rules'] = []
    let compileFailed = false
    for (const c of r.contracts) {
      try {
        rules.push({ include: c.include, contract: compileContractObject(c.def) })
      } catch (err) {
        errors.push(
          `${root}: contract '${c.name}' (${c.include.join(', ')}) failed to compile — ${(err as Error).message}`,
        )
        compileFailed = true
      }
    }
    if (compileFailed) return
    let findings: ReturnType<typeof runCorpus>['findings']
    try {
      findings = runCorpus({ rules }, { cwd: root, ...scope }).findings
    } catch (err) {
      errors.push(`${root}: self-check failed to run — ${(err as Error).message}`)
      return
    }
    for (const f of findings) {
      if (f.level === 'error') errors.push(`${root}: ${f.path} — ${f.id} (${f.message})`)
    }
  })
  return errors
}

/** The `--dry-run` output: each file as a `# path` line followed by its content. */
function renderDryRun(files: InferredFile[], results: InferResult[]): string {
  const blocks = files.map((f) => `# ${f.path}\n${f.content}`)
  const warnings = results.flatMap((r) => r.warnings)
  const trailer = warnings.length > 0 ? [``, `# warnings:`, ...warnings.map((w) => `#  ${w}`)] : []
  return [...blocks, ...trailer].join('\n').trimEnd()
}

/** The summary after writing: contracts and files, any warnings, and the self-check result. */
function renderSummary(
  results: InferResult[],
  files: InferredFile[],
  selfCheckErrors: string[],
): string {
  const groups = results.reduce((n, r) => n + r.contracts.length, 0)
  const warnings = results.flatMap((r) => r.warnings)
  const lines = [
    `init: inferred ${groups} contract(s); wrote ${files.length} file(s):`,
    ...files.map((f) => `  ${f.path}`),
  ]
  for (const w of warnings) lines.push(`warning: ${w}`)
  lines.push(
    selfCheckErrors.length === 0
      ? `self-check: clean (the scaffold accepts its own corpus)`
      : `self-check: FAILED — the scaffold rejects its own corpus (this is an inferer bug):`,
  )
  for (const e of selfCheckErrors) lines.push(`  ${e}`)
  return lines.join('\n')
}

/**
 * Builds a `CorpusConfig` from `--contract` flags, for a run with no config file. Two forms:
 *
 * - One contract, no `--path`: the contract applies to every `*.md` under the positional
 *   `<path>` (the run folder), as one rule with `include: ['**\/*.md']`.
 * - `--contract` and `--path` pairs: one rule per pair, `include: ['<dir>/**\/*.md']`, relative
 *   to the cwd. Each `<dir>` must be a folder inside the cwd. A positional `<path>` is not
 *   allowed here.
 *
 * Contract refs must be `.yaml` or `.yml`. A contract written in code goes in a `.js` or `.mjs`
 * config. Throws on a count mismatch or another file type. The caller turns the throw into exit 2.
 */
function buildInlineConfig(
  cwd: string,
  contracts: string[],
  paths: string[],
  pathArg?: string,
): { config: CorpusConfig; runRoot: string } {
  const load = (ref: string): Rule['contract'] => {
    if (!/\.ya?ml$/i.test(ref)) {
      throw new Error(
        `--contract must be a .yaml/.yml contract file (got '${ref}'); a contract written in code needs a .js or .mjs config`,
      )
    }
    return loadContractFile(isAbsolute(ref) ? ref : resolve(cwd, ref))
  }

  // One contract over a folder: `validate <path> --contract x.yaml`.
  if (paths.length === 0) {
    if (contracts.length !== 1) {
      throw new Error(
        `multiple --contract needs a matching --path for each (got ${contracts.length} --contract and no --path)`,
      )
    }
    const runRoot = pathArg ? resolve(cwd, pathArg) : cwd
    return {
      config: { rules: [{ include: ['**/*.md'], contract: load(contracts[0]!) }] },
      runRoot,
    }
  }

  // Pairs: `validate --contract a.yaml --path d1 --contract b.yaml --path d2`.
  if (paths.length !== contracts.length) {
    throw new Error(
      `each --contract needs a matching --path (got ${contracts.length} --contract and ${paths.length} --path)`,
    )
  }
  if (pathArg !== undefined) {
    throw new Error(
      `a positional <path> can't be combined with --contract/--path pairs; the --path of each pair is its target`,
    )
  }
  const rules: Rule[] = contracts.map((ref, i) => {
    // The glob is relative to the run folder (cwd), so a `--path` must be a folder inside it.
    // Anything else would match no file and pass with nothing checked.
    const raw = paths[i]!
    const abs = resolve(cwd, raw)
    if (!existsSync(abs) || !statSync(abs).isDirectory()) {
      throw new Error(`--path '${raw}' is not a folder`)
    }
    const rel = relative(cwd, abs)
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error(
        `--path '${raw}' is outside the current folder; run validate from a folder that holds it`,
      )
    }
    const dir = rel.split(sep).join('/')
    const include = dir === '' ? '**/*.md' : `${dir}/**/*.md`
    return { include: [include], contract: load(ref) }
  })
  return { config: { rules }, runRoot: cwd }
}

/**
 * Loads a `CorpusConfig`. With `--config`, that path (resolved against `cwd`) is used. Otherwise
 * it looks for the default names in `cwd`. A `.yaml` or `.yml` file goes through
 * `loadConfigFile`. A `.js` or `.mjs` file is loaded with `import()`, and its `default` export is
 * the config. A `.ts` or other file, a missing file, or a module with no `default` export
 * throws. The caller turns the throw into exit 2.
 */
async function loadConfig(cwd: string, configFlag?: string): Promise<CorpusConfig> {
  let configPath: string
  if (configFlag) {
    configPath = isAbsolute(configFlag) ? configFlag : resolve(cwd, configFlag)
    if (!existsSync(configPath)) {
      throw new Error(`config not found: ${configFlag}`)
    }
  } else {
    const found = DEFAULT_CONFIG_NAMES.map((n) => resolve(cwd, n)).find((p) => existsSync(p))
    if (!found) {
      throw new Error(
        `no config found (looked for ${DEFAULT_CONFIG_NAMES.join(', ')}); pass --config <file>`,
      )
    }
    configPath = found
  }

  if (/\.ya?ml$/i.test(configPath)) {
    return loadConfigFile(configPath)
  }

  if (!/\.(?:js|mjs)$/.test(configPath)) {
    throw new Error(
      `unsupported config extension: ${configPath} (only .js/.mjs/.yaml/.yml are supported; a .ts config needs a loader)`,
    )
  }

  const mod = (await import(pathToFileURL(configPath).href)) as { default?: unknown }
  const config = mod.default
  if (!config || typeof config !== 'object' || !Array.isArray((config as CorpusConfig).rules)) {
    throw new Error(
      `config ${configPath} must \`export default\` a CorpusConfig ({ rules: [...] })`,
    )
  }
  return config as CorpusConfig
}

/** Writes what a command returned to `ctx.io`, a newline after each non-empty stream, and returns its exit code. */
function emit(ctx: CommandContext, { code, stdout, stderr }: CliResult): number {
  if (stdout) ctx.io.stdout(`${stdout}\n`)
  if (stderr) ctx.io.stderr(`${stderr}\n`)
  return code
}

/** The `--glob`, `--include` and `--exclude` flags, which `validate` and `init` share. */
const scopeFlags = {
  glob: {
    kind: 'list',
    valueName: 'glob',
    help: 'Same as --include, relative to the run folder. Repeatable.',
  },
  include: {
    kind: 'list',
    valueName: 'glob',
    help: 'Only files matching this glob, relative to the run folder. Repeatable.',
  },
  exclude: {
    kind: 'list',
    valueName: 'glob',
    help: 'Skip files matching this glob, relative to the run folder. Repeatable.',
  },
} as const satisfies FlagSpec

export const validateCommand = defineCommand({
  interactive: true,
  summary: 'Check a folder of markdown against a config or a contract.',
  description:
    'Runs the folder <path> (default: the current folder) against the config named by --config, ' +
    'the default config file in it, or --contract (with --path for each, when several). A .js ' +
    'or .mjs config is loaded with import(), which runs its code. The findings go to stdout in ' +
    'the --format.',
  positionals: [{ name: 'path', variadic: true, help: 'The folder to check.' }],
  flags: {
    format: {
      kind: 'string',
      valueName: 'format',
      help: 'human (default), json or sarif.',
    },
    config: {
      kind: 'string',
      valueName: 'file',
      help: 'The config file. Default: look in <path>.',
    },
    contract: {
      kind: 'list',
      valueName: 'file',
      help: 'A YAML contract, instead of a config. Repeat it, with a --path each, for pairs.',
    },
    path: {
      kind: 'list',
      valueName: 'dir',
      help: 'The folder checked by the --contract before it.',
    },
    ...scopeFlags,
  },
  exits: { 1: 'an error-level finding' },
  examples: [
    'validate docs --format json',
    'validate --config markdown-contract.yaml',
    'validate --contract task.yaml --path tasks --contract note.yaml --path notes',
  ],
  readOnly: true,
  async run({ flags, positionals }, ctx) {
    return emit(ctx, await runValidate(ctx.cwd, positionals, flags))
  },
})

export const initCommand = defineCommand({
  interactive: true,
  summary: 'Infer contracts from existing markdown and write them.',
  description:
    'Infers a config and contracts from the markdown under each <dir> and writes them there ' +
    '(or under --out), then checks that they accept the files. Refuses to overwrite a file ' +
    'without --force. --check does not infer: it runs the existing config over the files and ' +
    'exits 1 when they have drifted from it.',
  positionals: [{ name: 'dir', variadic: true, help: 'A folder of markdown to infer from.' }],
  flags: {
    meta: {
      kind: 'boolean',
      help: 'One contract per folder, plus a config (default: one contract).',
    },
    depth: {
      kind: 'string',
      valueName: 'n',
      help: 'Folder depth for --meta (default 1; 0 means one contract).',
    },
    relax: { kind: 'boolean', help: 'Make the inferred contracts looser.' },
    inline: {
      kind: 'boolean',
      help: '--meta only: one config with the contracts inline, no contracts/ files.',
    },
    out: {
      kind: 'string',
      valueName: 'dir',
      help: 'Where to write. Default: the one root; the current folder for several roots.',
    },
    force: { kind: 'boolean', help: 'Overwrite existing files.' },
    'dry-run': { kind: 'boolean', help: 'Print the files to stdout and write nothing.' },
    check: {
      kind: 'boolean',
      help: 'Check that an existing config still accepts the files; write nothing.',
    },
    'max-const-len': {
      kind: 'string',
      valueName: 'n',
      help: 'A longer string never becomes a const or enum value.',
    },
    'min-const-examples': {
      kind: 'string',
      valueName: 'n',
      help: 'The number of documents a value needs to become a const.',
    },
    ...scopeFlags,
  },
  exits: { 1: 'the scaffold rejects its own corpus, or --check found drift' },
  examples: ['init docs', 'init docs --meta --dry-run', 'init docs --check'],
  async run({ flags, positionals }, ctx) {
    return emit(ctx, runInit(ctx.cwd, positionals, flags))
  },
})

export const migrateCommand = defineCommand({
  interactive: true,
  summary: 'Rewrite version 1 YAML contracts as version 2.',
  description:
    'Prints each migrated file to stdout, or with --write rewrites each in place. With several ' +
    'files and no --write, each document follows a --- line and a # <file> line. A file that is ' +
    'already version 2 is noted on stderr and left alone.',
  positionals: [{ name: 'file', variadic: true, help: 'A version 1 contract or config.' }],
  flags: {
    write: { kind: 'boolean', help: 'Rewrite each file in place instead of printing it.' },
  },
  examples: ['migrate task.contract.yaml', 'migrate contracts/*.yaml --write'],
  async run({ flags, positionals }, ctx) {
    return emit(ctx, runMigrate(ctx.cwd, positionals, flags.write))
  },
})

/** The `markdown-contract` command tree. */
export function createApp(): App {
  return defineApp({
    name: 'markdown-contract',
    version: VERSION,
    summary: 'Check markdown against contracts, and infer contracts from markdown.',
    commands: { validate: validateCommand, init: initCommand, migrate: migrateCommand },
  })
}

/** One output stream of a run, without its final newline. */
const trimmed = (text: string): string => (text.endsWith('\n') ? text.slice(0, -1) : text)

/**
 * Runs the `markdown-contract` command in-process: `argv` is what follows the command name, such
 * as `['validate', 'docs', '--format', 'json']`. It returns the exit code and the output instead
 * of printing them, and never exits the process.
 *
 * Commands: `validate` checks a folder against a config or a contract; `init` infers contracts
 * from a folder and writes them; `migrate` rewrites version 1 YAML contracts as version 2. `init`
 * and `migrate --write` write files. A `.js` or `.mjs` config is loaded with `import()`, which
 * runs its code.
 *
 * Exit codes: `0` success, `1` an error-level finding, `2` a usage or config error.
 *
 * @param opts.cwd The folder relative paths resolve against. Default: `process.cwd()`.
 * @experimental The CLI may change in a minor release.
 */
export async function runCli(argv: string[], opts?: { cwd?: string }): Promise<CliResult> {
  const ctx = captureContext(opts?.cwd === undefined ? {} : { cwd: opts.cwd })
  const code = await createApp().run(argv, ctx)
  return { code, stdout: trimmed(ctx.io.out), stderr: trimmed(ctx.io.err) }
}
