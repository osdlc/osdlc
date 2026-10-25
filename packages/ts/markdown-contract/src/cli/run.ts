/**
 * The CLI as a function. It parses the arguments, runs the command and returns the exit code and
 * the output. It never exits the process or writes to the real streams. `./bin.ts` does that.
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
import { assertLoads, isVersion2, migrateV1ToV2 } from '../declarative/migrate.js'
import { type CorpusConfig, runCorpus } from '../runner/index.js'
import { formatHuman, formatJson, formatRunSummary, formatSarif } from './format.js'

const USAGE = [
  'usage: markdown-contract validate <path> [--format human|json|sarif]',
  '       [--config <file>] | [--contract <file>] | [--contract <file> --path <dir> ...]',
  '       [--glob <glob> ...] [--include <glob> ...] [--exclude <glob> ...]',
  '',
  '       markdown-contract init <dir> ... [--meta] [--depth <n>] [--relax] [--inline]',
  '       [--out <dir>] [--force] [--dry-run] [--check]',
  '       [--max-const-len <n>] [--min-const-examples <n>]',
  '       [--glob <glob> ...] [--include <glob> ...] [--exclude <glob> ...]',
  '',
  '       markdown-contract migrate <file> ... [--write]',
].join('\n')

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

/**
 * Parses the CLI flags. It is a separate function so `runCli` can name its return type
 * (`ReturnType<typeof parseCliArgs>`) for `parsed`.
 */
function parseCliArgs(argv: string[]) {
  return parseArgs({
    args: argv,
    options: {
      format: { type: 'string' }, // human (default) | json | sarif
      config: { type: 'string' },
      contract: { type: 'string', multiple: true }, // a YAML contract (repeatable for pairs)
      path: { type: 'string', multiple: true }, // the target dir paired with each --contract
      glob: { type: 'string', multiple: true }, // same as --include, relative to the run folder
      include: { type: 'string', multiple: true }, // include globs, relative to the run folder
      exclude: { type: 'string', multiple: true }, // exclude globs, relative to the run folder
      help: { type: 'boolean', short: 'h' },
      // `init` flags.
      meta: { type: 'boolean' }, // one contract per folder, plus a config (default: one contract)
      depth: { type: 'string' }, // folder depth for --meta (default 1; 0 means one contract)
      relax: { type: 'boolean' }, // make the inferred contracts looser
      inline: { type: 'boolean' }, // --meta only: one config with the contracts inline, no contracts/ files
      out: { type: 'string' }, // where to write (default: the one root; cwd for several roots)
      force: { type: 'boolean' }, // overwrite existing files (default: refuse)
      'dry-run': { type: 'boolean' }, // print the files to stdout and write nothing
      check: { type: 'boolean' }, // check that an existing config still accepts the files
      'max-const-len': { type: 'string' }, // a longer string never becomes a const or enum value
      'min-const-examples': { type: 'string' }, // docs a value needs to become a const
      // `migrate` flag.
      write: { type: 'boolean' }, // rewrite each file in place instead of printing it
    },
    allowPositionals: true,
  })
}

/** The parsed flags, passed to each command. */
type CliValues = ReturnType<typeof parseCliArgs>['values']

/** The flags each command accepts. `--help` is handled before the command runs. */
const COMMAND_FLAGS: Record<string, readonly string[]> = {
  validate: ['format', 'config', 'contract', 'path', 'glob', 'include', 'exclude'],
  init: [
    'meta',
    'depth',
    'relax',
    'inline',
    'out',
    'force',
    'dry-run',
    'check',
    'max-const-len',
    'min-const-examples',
    'glob',
    'include',
    'exclude',
  ],
  migrate: ['write'],
}

/** A usage error for the first flag the command does not take, or `null` when all fit. */
function checkFlags(command: string, values: CliValues): CliResult | null {
  const allowed = COMMAND_FLAGS[command] ?? []
  const stray = Object.keys(values).find((flag) => flag !== 'help' && !allowed.includes(flag))
  if (stray === undefined) return null
  return {
    code: 2,
    stdout: '',
    stderr: `markdown-contract: --${stray} does not apply to ${command}\n${USAGE}`,
  }
}

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

  const [command = '', ...rest] = positionals
  if (!Object.hasOwn(COMMAND_FLAGS, command)) {
    return {
      code: 2,
      stdout: '',
      stderr: `markdown-contract: unknown command "${command}"\n${USAGE}`,
    }
  }
  const stray = checkFlags(command, values)
  if (stray) return stray
  if (command === 'init') return runInit(cwd, rest, values)
  if (command === 'validate') return runValidate(cwd, rest, values)
  return runMigrate(cwd, rest, values.write === true)
}

/**
 * `markdown-contract validate <path>`: finds the run folder and the `CorpusConfig`, runs it and
 * formats the findings. `--contract` and `--config` both become one `CorpusConfig` for
 * `runCorpus`. Exit codes: `0` or `1` from `runCorpus`, `2` for a usage or config error.
 */
async function runValidate(cwd: string, rest: string[], values: CliValues): Promise<CliResult> {
  if (rest.length > 1) {
    return {
      code: 2,
      stdout: '',
      stderr: `markdown-contract: validate takes one <path> (got ${rest.length})\n${USAGE}`,
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
interface InitFlags {
  meta?: boolean
  depth?: string
  relax?: boolean
  inline?: boolean
  out?: string
  force?: boolean
  'dry-run'?: boolean
  check?: boolean
  'max-const-len'?: string
  'min-const-examples'?: string
  glob?: string[]
  include?: string[]
  exclude?: string[]
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
 * mode the written config lists every root's contract. In `--meta` mode the first root's file
 * wins at each path, so later roots' configs are dropped. A summary (groups, files, warnings, self-check) goes to stdout.
 * Usage and config errors exit 2.
 */
function runInit(cwd: string, roots: string[], flags: InitFlags): CliResult {
  if (roots.length === 0) {
    return {
      code: 2,
      stdout: '',
      stderr: `markdown-contract: init needs at least one <dir>\n${USAGE}`,
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

  const files = mergeFiles(results, opts)

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
  const value = Number(raw)
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
 * inside `<dir>`.
 */
function mergeFiles(results: InferResult[], opts: InferOptions): InferredFile[] {
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
 *   to the cwd. A positional `<path>` is not allowed here.
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
    const dir = paths[i]!.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
    const include = dir === '' || dir === '.' ? '**/*.md' : `${dir}/**/*.md`
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
