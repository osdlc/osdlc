/**
 * The CLI as a function. It parses the arguments, runs the command and returns the exit code and
 * the output. It never exits the process or writes to the real streams; `./bin.ts` does that.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

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
import { migrateV1ToV2 } from '../declarative/migrate.js'
import { type CorpusConfig, runCorpus } from '../runner/index.js'
import { formatHuman, formatJson, formatRunSummary, formatSarif } from './format.js'

const USAGE = [
  'usage: markdown-contract validate <path> [--format human|json|sarif]',
  '       [--config <file>] | [--contract <file>] | [--contract <file> --path <dir> ...]',
  '       [--glob <glob> ...] [--include <glob> ...] [--exclude <glob> ...]',
  '',
  '       markdown-contract init <dir> ... [--meta] [--depth <n>] [--relax] [--inline]',
  '       [--out <dir>] [--force] [--dry-run] [--check] [--infer-bounds]',
  '       [--max-const-len <n>] [--min-const-examples <n>]',
  '       [--glob <glob> ...] [--include <glob> ...] [--exclude <glob> ...]',
  '',
  '       markdown-contract migrate <file> ... [--write]',
].join('\n')

/** A single corpus rule (`include`/`exclude` globs → contract) — the unit a CorpusConfig holds. */
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

/**
 * `parseArgs` over the CLI flag schema — extracted so `runCli` can name its exact
 * return type (`ReturnType<typeof parseCliArgs>`) instead of relying on an implicit
 * `any` for the `parsed` binding.
 */
function parseCliArgs(argv: string[]) {
  return parseArgs({
    args: argv,
    options: {
      format: { type: 'string', default: 'human' }, // human | json | sarif
      config: { type: 'string' },
      contract: { type: 'string', multiple: true }, // a YAML contract (repeatable for pairs)
      path: { type: 'string', multiple: true }, // the target dir paired with each --contract
      glob: { type: 'string', multiple: true }, // include filter (alias of --include), relative to run root
      include: { type: 'string', multiple: true }, // include filter, relative to run root
      exclude: { type: 'string', multiple: true }, // exclude filter, relative to run root
      help: { type: 'boolean', short: 'h' },
      // `init` flags.
      meta: { type: 'boolean' }, // emit a meta-config + per-dir contracts (default: single)
      depth: { type: 'string' }, // directory cut for --meta (default 1; 0 == single)
      relax: { type: 'boolean' }, // loosen generation toward a permissive floor
      inline: { type: 'boolean' }, // one self-contained config instead of contracts/ files
      out: { type: 'string' }, // where to write (default: the single inferred root; cwd for multi-root)
      force: { type: 'boolean' }, // overwrite an existing config (default: refuse)
      'dry-run': { type: 'boolean' }, // print the would-be files to stdout; write nothing
      check: { type: 'boolean' }, // verify an existing config still accepts the tree
      'infer-bounds': { type: 'boolean' }, // opt into pattern / min / max inference
      'max-const-len': { type: 'string' }, // cap: strings longer than this never become const/enum
      'min-const-examples': { type: 'string' }, // floor: a uniform scalar needs >= n docs to become const
      // `migrate` flag.
      write: { type: 'boolean' }, // rewrite each file in place instead of printing it
    },
    allowPositionals: true,
  })
}

/** The parsed CLI flag bag (`parseArgs` values) threaded into the command handlers. */
type CliValues = ReturnType<typeof parseCliArgs>['values']

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
  const cwd = opts?.cwd ?? process.cwd()

  let parsed: ReturnType<typeof parseCliArgs>
  try {
    parsed = parseCliArgs(argv)
  } catch (err) {
    return {
      code: 2,
      stdout: '',
      stderr: `markdown-contract: ${(err as Error).message}\n${USAGE}`,
    }
  }

  const { values, positionals } = parsed

  // `--help` → usage on stdout, exit 0. No args at all → usage on stderr, exit 2.
  if (values.help) return { code: 0, stdout: USAGE, stderr: '' }
  if (positionals.length === 0) return { code: 2, stdout: '', stderr: USAGE }

  const [command, ...rest] = positionals
  if (command === 'init') return runInit(cwd, rest, values)
  if (command === 'validate') return runValidate(cwd, rest, values)
  if (command === 'migrate') return runMigrate(cwd, rest, values.write === true)
  return {
    code: 2,
    stdout: '',
    stderr: `markdown-contract: unknown command "${command}"\n${USAGE}`,
  }
}

/**
 * `markdown-contract validate <path>` — resolve the run root + `CorpusConfig`, run the corpus, and
 * format the findings. Both inline `--contract` and file `--config` forms compile to one
 * CorpusConfig run through the same `runCorpus`. Exit codes: `0`/`1` from `runCorpus`, `2` for a
 * usage/config error raised here.
 */
async function runValidate(cwd: string, rest: string[], values: CliValues): Promise<CliResult> {
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

  // Global glob pre-filter (relative to the run root), applied in EVERY mode incl.
  // --config. `--glob` is the friendly alias of `--include`; both feed the include set.
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
 * The usage guards for `validate`: an unknown `--format`, `--contract` + `--config` together, or
 * `--path` with no `--contract`. Returns the `code: 2` result to short-circuit on, or `null` when
 * the flags are coherent. The contract binding comes from EITHER an inline `--contract` (config-less
 * parameterization) OR a `--config` file, never both.
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
      stderr: `markdown-contract: use either --contract or --config, not both\n${USAGE}`,
    }
  }
  if (contracts.length === 0 && paths.length > 0) {
    return {
      code: 2,
      stdout: '',
      stderr: `markdown-contract: --path requires a matching --contract\n${USAGE}`,
    }
  }
  return null
}

/**
 * Resolve the run root (the runner's cwd) and the `CorpusConfig` — inline `--contract` builds it
 * directly; otherwise the `--config` file is loaded. A throw from either (bad/missing config, etc.)
 * becomes a `code: 2` error result.
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
 * Run the corpus, mapping a runtime failure inside the runner (e.g. a contract throwing) to a
 * `code: 2` error result — from the CLI's vantage that is a config/usage problem, not a crash.
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
 * Render the findings for the chosen `format`. The human format gains an additive run summary
 * (total + per-contract counts) above the findings report; json/sarif are byte-for-byte the bare
 * finding outputs (the summary is human-only).
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
 * Warnings go to stderr. A file that cannot be read or is not a version 1 document is reported
 * and skipped, and the exit code is then 2.
 */
function runMigrate(cwd: string, files: string[], write: boolean): CliResult {
  if (files.length === 0) {
    return {
      code: 2,
      stdout: '',
      stderr: `markdown-contract: migrate needs at least one <file>\n${USAGE}`,
    }
  }
  const stdout: string[] = []
  const stderr: string[] = []
  let failed = false
  for (const file of files) {
    const abs = resolve(cwd, file)
    try {
      const { out, warnings } = migrateV1ToV2(readFileSync(abs, 'utf8'), file)
      for (const w of warnings) stderr.push(`warn: ${w}`)
      if (write) {
        writeFileSync(abs, out)
        stdout.push(`migrated: ${file}`)
      } else {
        stdout.push(out.endsWith('\n') ? out.slice(0, -1) : out)
      }
    } catch (err) {
      failed = true
      stderr.push(`markdown-contract: ${(err as Error).message}`)
    }
  }
  return { code: failed ? 2 : 0, stdout: stdout.join('\n'), stderr: stderr.join('\n') }
}

/** The parsed-flag bag `runCli` threads into `runInit` (the `init`-relevant subset of `parseArgs` values). */
interface InitFlags {
  meta?: boolean
  depth?: string
  relax?: boolean
  inline?: boolean
  out?: string
  force?: boolean
  'dry-run'?: boolean
  check?: boolean
  'infer-bounds'?: boolean
  'max-const-len'?: string
  'min-const-examples'?: string
  glob?: string[]
  include?: string[]
  exclude?: string[]
}

/** The default config filename `init` writes and `--check` loads back (a `markdown-contract.yaml` router/inline config). */
const INIT_CONFIG_NAME = 'markdown-contract.yaml'

/**
 * `markdown-contract init <dir>…` — infer a tight-but-accepting config from existing markdown,
 * then IO + self-check around the pure `inferConfig` pipeline.
 *
 * The pure inference is in `../declarative/infer`; this verb owns everything stateful around it:
 *  - **scope** — `--include` / `--exclude` / `--glob` choose which files feed inference, exactly
 *    as `validate` scopes a run; the same globs also scope the self-check.
 *  - **`--dry-run`** — print the would-be files to stdout and write nothing (exit 0).
 *  - **write** — otherwise write `result.files` under `--out` (default: the single inferred root,
 *    so `validate <dir>` / `init <dir> --check` find the scaffold from any cwd; a multi-root run
 *    has no single natural base, so it falls back to cwd with a stderr warning), REFUSING to
 *    clobber an existing config without `--force` (exit 2). Single-contract mode additionally
 *    writes a `markdown-contract.yaml` router so `validate <dir>` auto-discovers the scaffold.
 *  - **self-check** — after writing, load the scaffold back through `loadConfigFile` and run it
 *    over the corpus via `runCorpus`; an error-level finding is an inferer bug, reported loudly.
 *  - **`--check`** — do NOT infer or write: load the EXISTING config and run it over the tree;
 *    exit 0 if clean, 1 if any error-level finding (the CI drift guard).
 *
 * Multiple roots merge into one run: each root is inferred and self-checked against its own tree
 * (globs are run-root-relative, so each root's contracts are verified with that root as cwd), and
 * the emitted files carry every root's contracts. A summary (groups, files, warnings, self-check)
 * is printed to stdout; usage/config errors exit 2.
 */
function runInit(cwd: string, roots: string[], flags: InitFlags): CliResult {
  if (roots.length === 0) {
    return {
      code: 2,
      stdout: '',
      stderr: `markdown-contract: init needs at least one <dir>\n${USAGE}`,
    }
  }

  // --depth / --max-const-len / --min-const-examples parse to integers; a bad value is a usage error.
  const nums = parseInitNumericFlags(flags)
  if ('error' in nums) return nums.error

  const scope = buildInitScope(flags)

  const absRoots = roots.map((r) => (isAbsolute(r) ? r : resolve(cwd, r)))
  const rootsError = checkRootsExist(absRoots)
  if (rootsError) return rootsError

  const { outDir, warning: multiRootWarning } = resolveInitOutDir(flags, cwd, absRoots)

  // --check: verify an EXISTING config against the tree(s); never infer or write.
  if (flags.check === true) {
    return runInitCheck(absRoots, scope)
  }

  const opts = buildInferOptions(flags, scope, nums)

  // Infer one result per root, then merge into the files to write (and verify per root).
  const inferred = inferAll(absRoots, opts)
  if ('error' in inferred) return inferred.error
  const results = inferred.results

  const files = mergeFiles(results, opts)

  // --dry-run: print the would-be files; write nothing.
  if (flags['dry-run'] === true) {
    return { code: 0, stdout: renderDryRun(files, results), stderr: '' }
  }

  const writeError = writeInitFiles(files, outDir, flags.force === true)
  if (writeError) return writeError

  // Self-check: load each root's contracts back and run them over that root (accept-by-construction).
  const selfCheckErrors = selfCheck(results, absRoots, scope)

  const summary = renderSummary(results, files, selfCheckErrors)
  // A self-check failure is an inferer bug, surfaced loudly with a non-zero exit. The multi-root
  // cwd-fallback warning (empty otherwise) rides along on stderr regardless of the self-check.
  return selfCheckErrors.length > 0
    ? { code: 1, stdout: summary, stderr: multiRootWarning }
    : { code: 0, stdout: summary, stderr: multiRootWarning }
}

/** The parsed numeric `init` knobs, or the `code: 2` usage error for the first bad value. */
interface InitNumericFlags {
  depth?: number
  maxConstStringLength?: number
  minConstExamples?: number
}

/**
 * Parse `--depth` / `--max-const-len` / `--min-const-examples` (each an optional integer with a
 * lower bound). Returns the parsed values, or the `code: 2` usage error for the first bad flag.
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

/** Parse one optional integer flag with a lower bound, or the `code: 2` usage error `message(raw)`. */
function parseIntFlag(
  raw: string | undefined,
  min: number,
  message: (raw: string) => string,
): { value: number | undefined } | { error: CliResult } {
  if (raw === undefined) return { value: undefined }
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min) {
    return { error: { code: 2, stdout: '', stderr: message(raw) } }
  }
  return { value }
}

/** The `--glob` / `--include` / `--exclude` scope, as `validate` (undefined when empty). */
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
 * Resolve the write target and any multi-root warning. Default the target to the SINGLE inferred
 * root, so the config, `contracts/`, and the root-relative globs share one base and
 * `init <dir> --check` finds what `init <dir>` wrote from any cwd. A multi-root run has no single
 * natural base, so it keeps the cwd fallback (with a warning). Explicit `--out` overrides both.
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

/** Assemble the `InferOptions` from the boolean flags, the parsed numeric knobs, and the scope. */
function buildInferOptions(
  flags: InitFlags,
  scope: { include?: string[]; exclude?: string[] },
  nums: InitNumericFlags,
): InferOptions {
  return {
    meta: flags.meta === true,
    relax: flags.relax === true,
    inline: flags.inline === true,
    inferBounds: flags['infer-bounds'] === true,
    ...(nums.depth !== undefined ? { depth: nums.depth } : {}),
    ...(nums.maxConstStringLength !== undefined
      ? { maxConstStringLength: nums.maxConstStringLength }
      : {}),
    ...(nums.minConstExamples !== undefined ? { minConstExamples: nums.minConstExamples } : {}),
    ...scope,
  }
}

/** Infer one result per root, or the `code: 2` error result for a throw (e.g. a heading clash). */
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
 * Write every inferred file under `outDir`, refusing to clobber an existing config (the router, or
 * any per-contract file) without `--force`. Returns a `code: 2` error result on a clash or a write
 * failure, or `null` on success.
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
 * `--check`: load the EXISTING config near each root and run it over the
 * tree. No inference, no write. Exit 0 when every root is clean, 1 when any error-level finding
 * appears (a doc drifted from the inferred shape — the CI drift guard). A missing config is a
 * usage error (exit 2): `--check` verifies a config that already exists.
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
 * Merge each root's `InferResult.files` into the single set the verb writes. In meta mode every
 * root already emits a self-contained `markdown-contract.yaml` (+ `contracts/`), so the files
 * pass through (a multi-root run keeps the first root's config as the discoverable router; the
 * self-check verifies each root independently). In single-contract mode each root emits one
 * `<name>.contract.yaml`; the verb additionally synthesizes a `markdown-contract.yaml` router
 * over those contracts so `validate <dir>` auto-discovers the scaffold (inference
 * leaves single mode as a bare contract file; the router is the discovery affordance the verb adds).
 */
function mergeFiles(results: InferResult[], opts: InferOptions): InferredFile[] {
  if (opts.meta === true) {
    // Meta mode: each root self-describes. Keep the first root's router/contracts as the output;
    // additional roots' files are de-duplicated by path (first wins) so a re-run diffs cleanly.
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

  // Single mode: write each root's contract file + a router that references them all.
  const contracts: InferredContract[] = results.flatMap((r) => r.contracts)
  const files: InferredFile[] = results.flatMap((r) => r.files)
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
 * Self-check the written scaffold: compile each root's contracts and run
 * them over that root via `runCorpus`. Each root is checked with itself as cwd, so the run-root-
 * relative globs route exactly the files inference saw. Returns the error-level findings (a
 * non-empty list means an emitted constraint is tighter than the data allows — an inferer bug).
 */
function selfCheck(
  results: InferResult[],
  absRoots: string[],
  scope: { include?: string[]; exclude?: string[] },
): string[] {
  const errors: string[] = []
  results.forEach((r, i) => {
    const root = absRoots[i]!
    // Compile each contract on its own so a build-time guard (e.g. contract/key-collision) is
    // reported as a clean, attributed self-check failure — naming the contract and its globs —
    // instead of escaping as an uncaught throw that crashes the verb.
    const rules: CorpusConfig['rules'] = []
    let compileFailed = false
    for (const c of r.contracts) {
      try {
        // Inferred defs are authored in the v2 vocabulary.
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

/** Render the `--dry-run` output: each would-be file as a `# path` banner followed by its content. */
function renderDryRun(files: InferredFile[], results: InferResult[]): string {
  const blocks = files.map((f) => `# ${f.path}\n${f.content}`)
  const warnings = results.flatMap((r) => r.warnings)
  const trailer = warnings.length > 0 ? [``, `# warnings:`, ...warnings.map((w) => `#  ${w}`)] : []
  return [...blocks, ...trailer].join('\n').trimEnd()
}

/** Render the post-write human summary: groups/files, any warnings, and the self-check verdict. */
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
 * Build a `CorpusConfig` from inline `--contract` flags — the config-less parameterization
 * of the same binary. Two shapes:
 *
 * - **one contract, no `--path`**: apply that contract to every `*.md` under the positional
 *   `<path>` (the run root) — a single catch-all rule `include: ['**\/*.md']`.
 * - **paired `--contract` + `--path`**: one rule per pair, `include: ['<dir>/**\/*.md']`,
 *   matched relative to the run root (the cwd); a positional `<path>` is not used here.
 *
 * Contract refs must be `.yaml`/`.yml` (a contract written in code goes in a `.js` / `.mjs` config).
 * Throws on a count mismatch or an unsupported ref; the caller maps the throw to a `2` exit.
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

  // Single contract over a tree: `validate <path> --contract x.yaml`.
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

  // Paired routing: `validate --contract a.yaml --path d1 --contract b.yaml --path d2`.
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
    const dir = paths[i]!.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
    const include = dir === '' || dir === '.' ? '**/*.md' : `${dir}/**/*.md`
    return { include: [include], contract: load(ref) }
  })
  return { config: { rules }, runRoot: cwd }
}

/**
 * Load a `CorpusConfig` from a `.js`/`.mjs` module via dynamic `import()`. With an
 * explicit `--config`, that path (resolved against `cwd`) is used; otherwise the
 * default names are probed in `cwd`. The module's `default` export is the config.
 * A `.ts` config (or any unsupported extension), a missing file, or a module without
 * a `default` export each throw — the caller maps the throw to a `2` exit.
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

  // A declarative YAML config compiles to a CorpusConfig via the declarative front-end.
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
