/**
 * The folder runner: walks a folder, sends each file to the first config rule whose globs match
 * it, and returns every finding with an exit code. It reads files and returns data. It never
 * writes output or exits.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import picomatch from 'picomatch'

import type { Contract, Finding } from '../core/index.js'
import { hasErrors } from '../core/finding-view.js'

/**
 * The config `runCorpus()` takes: an ordered list of rules. Each rule sends the files its
 * `include` globs match, less those its `exclude` globs match, to its `contract`. A file goes to
 * the first rule that matches it. Globs match paths relative to the run folder, with `/`.
 *
 * `name` is an optional label for the rule's contract, which the CLI's run summary prints. The
 * runner does not use it.
 */
export interface CorpusConfig {
  rules: Array<{ include: string[]; exclude?: string[]; contract: Contract; name?: string }>
}

/**
 * The counts `runCorpus()` returns with the findings. `filesMatched` is the sum of
 * `matchedByRule`, and `filesUnmatched` is `filesScanned - filesMatched`. A file the `include` or
 * `exclude` option removes, or that no rule matches, counts as unmatched.
 */
export interface RunStats {
  /** Every file under the run folder. */
  filesScanned: number
  /** The files sent to a rule's contract. */
  filesMatched: number
  /** The files not sent to any contract. */
  filesUnmatched: number
  /** The files each rule matched, in the order of `config.rules`. */
  matchedByRule: number[]
}

/**
 * Returns its argument. In a `markdown-contract.config.js` or `.mjs` file it gives the config
 * object the `CorpusConfig` type, for editor completion and checking.
 */
export function defineConfig(config: CorpusConfig): CorpusConfig {
  return config
}

/** A rule with its include/exclude matchers compiled once, ahead of the walk. */
interface CompiledRule {
  include: ReturnType<typeof picomatch>
  exclude: ReturnType<typeof picomatch> | null
  contract: Contract
}

/** picomatch options. `dot` makes dotfiles match like any other file. */
const PICOMATCH_OPTS = { dot: true } as const

/**
 * Compiles globs into a matcher with the runner's options (`PICOMATCH_OPTS`). The runner uses it
 * for every `include` and `exclude`, so tests of it test the runner's real matching. For example,
 * one `**\/`-prefixed glob matches files at the run root and in subfolders, so a rule needs only
 * one entry. Such a test fails if an options change or a picomatch upgrade breaks this.
 */
export function compileMatcher(globs: string[]): ReturnType<typeof picomatch> {
  return picomatch(globs, PICOMATCH_OPTS)
}

function compile(config: CorpusConfig): CompiledRule[] {
  return config.rules.map((r) => ({
    include: compileMatcher(r.include),
    exclude: r.exclude && r.exclude.length > 0 ? compileMatcher(r.exclude) : null,
    contract: r.contract,
  }))
}

/** True when `posixRel` passes the run's `include` and `exclude` options, when given. */
function passesPreFilter(
  posixRel: string,
  include: ReturnType<typeof picomatch> | null,
  exclude: ReturnType<typeof picomatch> | null,
): boolean {
  if (exclude && exclude(posixRel)) return false
  if (include && !include(posixRel)) return false
  return true
}

/** The index of the first rule whose include matches and exclude does not, or -1. */
function firstMatchingRule(rules: CompiledRule[], posixRel: string): number {
  return rules.findIndex((r) => r.include(posixRel) && !(r.exclude && r.exclude(posixRel)))
}

/** Directories the walk never enters. */
const SKIPPED_DIRS = new Set(['.git', 'node_modules'])

/**
 * Every file under `root`, as paths relative to `root` with `/` separators. Entries are sorted
 * before recursion, so the order is stable. Symbolic links are neither files nor directories to
 * `Dirent`, so they are skipped, and so are `.git` and `node_modules` directories.
 */
export function walkSync(root: string): string[] {
  const out: string[] = []
  const recur = (absDir: string, relDir: string): void => {
    const entries = readdirSync(absDir, { withFileTypes: true })
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const entry of entries) {
      const rel = relDir === '' ? entry.name : `${relDir}/${entry.name}`
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) recur(resolve(absDir, entry.name), rel)
      } else if (entry.isFile()) out.push(rel)
    }
  }
  recur(root, '')
  return out
}

/**
 * Checks every file under a folder against a config and returns all findings, an exit code and
 * counts.
 *
 * Each file goes to the first rule whose `include` globs match it and whose `exclude` globs do
 * not, so a specific rule can sit before a catch-all without a file being checked twice. A file
 * no rule matches is skipped. A finding's `path` is the file's path relative to `cwd`, with `/`.
 * The walk is sorted by name. It does not follow symbolic links and does not enter `.git` or
 * `node_modules` folders.
 *
 * `include` and `exclude` narrow the run before rules apply: a file must match one `include`
 * glob, when any are given, and no `exclude` glob.
 *
 * `exitCode` is `1` when any finding is an error and `0` otherwise.
 *
 * @param opts.cwd The folder to walk. Default: `process.cwd()`.
 * @param opts.include Globs a file must match to be checked.
 * @param opts.exclude Globs that remove a file from the run.
 * @param config The rules: globs and the contract for the files they match.
 * @returns The findings, `exitCode` and the counts.
 * @throws {Error} When the folder or a file cannot be read, or where `Contract.validate` throws.
 */
export function runCorpus(
  config: CorpusConfig,
  opts?: {
    cwd?: string
    include?: string[]
    exclude?: string[]
  },
): { findings: Finding[]; exitCode: number; stats: RunStats } {
  const root = resolve(opts?.cwd ?? process.cwd())
  const rules = compile(config)

  // The run's own include and exclude, applied before the rules.
  const include = opts?.include && opts.include.length > 0 ? compileMatcher(opts.include) : null
  const exclude = opts?.exclude && opts.exclude.length > 0 ? compileMatcher(opts.exclude) : null

  const findings: Finding[] = []
  const files = walkSync(root)

  // `matchedByRule[i]` counts the files rule `i` of `config.rules` matched. The CLI prints it
  // against the rule's name.
  const matchedByRule: number[] = Array.from({ length: config.rules.length }, () => 0)
  let filesMatched = 0

  for (const rel of files) {
    if (!passesPreFilter(rel, include, exclude)) continue
    const idx = firstMatchingRule(rules, rel)
    if (idx === -1) continue
    matchedByRule[idx] = matchedByRule[idx]! + 1
    filesMatched += 1
    const source = readFileSync(resolve(root, rel), 'utf8')
    const result = rules[idx]!.contract.validate(source, { path: rel })
    findings.push(...result.findings)
  }

  const stats: RunStats = {
    filesScanned: files.length,
    filesMatched,
    filesUnmatched: files.length - filesMatched,
    matchedByRule,
  }

  const hasError = hasErrors(findings)
  return { findings, exitCode: hasError ? 1 : 0, stats }
}
