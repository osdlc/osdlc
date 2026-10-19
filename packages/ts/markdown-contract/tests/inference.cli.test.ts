/**
 * CLI-level tests for `markdown-contract init`.
 *
 * These drive the real CLI through `runCli` over throwaway copies of the inference fixture
 * vaults (copied into an OS temp dir via `mkdtempSync`, so a write-mode `init` never touches
 * the checked-in fixtures). They cover the verb's full surface: `--dry-run`, the default write
 * + `--force` clobber refusal, `--meta --depth N`, `--inline`, the `--check` drift guard,
 * multi-root runs, and `--include`/`--exclude` scoping.
 */
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, test } from 'vitest'

import { runCli } from '../src/cli/index.js'

const made: string[] = []

/** A fresh temp dir, removed after the suite. */
function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  made.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

/** Copy a fixture vault into a fresh temp dir so write-mode `init` runs never mutate fixtures. */
function stageVault(rel: string): string {
  const src = fileURLToPath(new URL(`./fixtures/infer/${rel}/vault`, import.meta.url))
  const dst = tmp('mc-init-')
  cpSync(src, dst, { recursive: true })
  return dst
}

describe('markdown-contract init (CLI)', () => {
  test('--dry-run prints YAML, writes nothing, exits 0', async () => {
    const dir = stageVault('01-flat-uniform')
    const r = await runCli(['init', dir, '--dry-run'], { cwd: dir })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('kind:')
    // Nothing was written.
    expect(existsSync(join(dir, 'markdown-contract.yaml'))).toBe(false)
    expect(existsSync(join(dir, '01-flat-uniform.contract.yaml'))).toBe(false)
  })

  test('default write creates a config; a re-run without --force exits 2; --force overwrites', async () => {
    const dir = stageVault('01-flat-uniform')

    const first = await runCli(['init', dir], { cwd: dir })
    expect(first.code).toBe(0)
    const written = await runCli(['validate', dir], { cwd: dir })
    expect(written.code).toBe(0) // accept-by-construction over the written config

    // A second run refuses to clobber the existing config.
    const second = await runCli(['init', dir], { cwd: dir })
    expect(second.code).toBe(2)

    // --force overwrites and succeeds.
    const forced = await runCli(['init', dir, '--force'], { cwd: dir })
    expect(forced.code).toBe(0)
  })

  test('--meta --depth 1 writes markdown-contract.yaml + contracts/', async () => {
    const dir = stageVault('07-tree-depth1')
    const r = await runCli(['init', dir, '--meta', '--depth', '1'], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, 'markdown-contract.yaml'))).toBe(true)
    expect(existsSync(join(dir, 'contracts'))).toBe(true)
  })

  test('--inline writes a single self-contained config', async () => {
    const dir = stageVault('07-tree-depth1')
    const r = await runCli(['init', dir, '--meta', '--inline'], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, 'markdown-contract.yaml'))).toBe(true)
    // Inline → no separate per-contract files dir.
    expect(existsSync(join(dir, 'contracts'))).toBe(false)
  })

  test('--out <dir> writes the scaffold under <dir>, leaving cwd untouched', async () => {
    // Three distinct dirs: the source vault to infer from, the write target, and an
    // unrelated cwd. --out must steer every written file to <dir>, never to cwd.
    const vault = stageVault('07-tree-depth1')
    const outDir = tmp('mc-out-')
    const cwd = tmp('mc-cwd-')

    const r = await runCli(['init', vault, '--meta', '--out', outDir], { cwd })
    expect(r.code).toBe(0)

    // The scaffold (config + per-contract files) lands under the --out target.
    expect(existsSync(join(outDir, 'markdown-contract.yaml'))).toBe(true)
    expect(existsSync(join(outDir, 'contracts'))).toBe(true)
    expect(readdirSync(join(outDir, 'contracts')).some((f) => f.endsWith('.contract.yaml'))).toBe(
      true,
    )

    // cwd is left completely untouched by the run.
    expect(existsSync(join(cwd, 'markdown-contract.yaml'))).toBe(false)
    expect(existsSync(join(cwd, 'contracts'))).toBe(false)
    expect(readdirSync(cwd)).toHaveLength(0)
  })

  test('default write lands under <dir> (the inferred root), not cwd, when run from a foreign cwd', async () => {
    // The scaffold is anchored to the single inferred root by default, so it shares one base
    // with the root-relative globs and `--check` — regardless of where the command is run from.
    const vault = stageVault('07-tree-depth1')
    const cwd = tmp('mc-cwd-')

    const r = await runCli(['init', vault, '--meta'], { cwd })
    expect(r.code).toBe(0)

    // The scaffold lands under the inferred root <dir>.
    expect(existsSync(join(vault, 'markdown-contract.yaml'))).toBe(true)
    expect(existsSync(join(vault, 'contracts'))).toBe(true)

    // The foreign cwd is left completely untouched.
    expect(existsSync(join(cwd, 'markdown-contract.yaml'))).toBe(false)
    expect(existsSync(join(cwd, 'contracts'))).toBe(false)
    expect(readdirSync(cwd)).toHaveLength(0)

    // The clobber guard operates on the NEW default location: a re-run from the same foreign
    // cwd still refuses to overwrite the scaffold at the inferred root without --force.
    const reRun = await runCli(['init', vault, '--meta'], { cwd })
    expect(reRun.code).toBe(2)
  })

  test('init <dir> then init <dir> --check round-trips from a foreign cwd (exit 0)', async () => {
    // The round-trip that fails today: with the scaffold written to the inferred root, `--check`
    // (which loads resolve(<dir>, markdown-contract.yaml)) finds it from any cwd.
    const vault = stageVault('01-flat-uniform')
    const cwd = tmp('mc-cwd-')

    const init = await runCli(['init', vault], { cwd })
    expect(init.code).toBe(0)

    const check = await runCli(['init', vault, '--check'], { cwd })
    expect(check.code).toBe(0)
  })

  test('multi-root without --out writes to cwd and warns, suggesting --out', async () => {
    // A multi-root run has no single natural base, so it keeps the cwd fallback — and says so.
    const a = stageVault('01-flat-uniform')
    const b = stageVault('02-optional-sections')
    const cwd = tmp('mc-cwd-')

    const r = await runCli(['init', a, b, '--meta'], { cwd })
    expect(r.code).toBe(0)

    // The scaffold lands in cwd (the fallback base), not in either root.
    expect(existsSync(join(cwd, 'markdown-contract.yaml'))).toBe(true)

    // A warning names the fallback and suggests --out.
    expect(r.stderr).toContain(
      'init: multiple roots — writing the scaffold to the current directory (pass --out <dir> to choose)',
    )
  })

  test('--check exits 0 when the config still accepts, 1 after a doc drifts', async () => {
    const dir = stageVault('01-flat-uniform')
    const init = await runCli(['init', dir], { cwd: dir })
    expect(init.code).toBe(0)

    const clean = await runCli(['init', dir, '--check'], { cwd: dir })
    expect(clean.code).toBe(0)

    // Mutate a doc so it drifts from the inferred shape (drop a required section).
    const drifted =
      '---\ntitle: Alpha rollout\nstatus: open\n---\n\n## Summary\n\nNo other sections.\n'
    writeFileSync(join(dir, 'alpha.md'), drifted)
    const after = await runCli(['init', dir, '--check'], { cwd: dir })
    expect(after.code).toBe(1)
  })

  test('multi-root: init a b infers a config spanning both roots', async () => {
    const a = stageVault('01-flat-uniform')
    const b = stageVault('02-optional-sections')
    const r = await runCli(['init', a, b, '--meta'], { cwd: a })
    expect(r.code).toBe(0)
  })

  test('--include / --exclude scope which files feed inference', async () => {
    const dir = stageVault('09-root-and-subdirs')

    const included = await runCli(
      ['init', dir, '--meta', '--include', 'guides/**/*.md', '--dry-run'],
      { cwd: dir },
    )
    expect(included.code).toBe(0)
    expect(included.stdout).toContain('guides')

    const excluded = await runCli(
      ['init', dir, '--meta', '--exclude', 'reference/**/*.md', '--dry-run'],
      { cwd: dir },
    )
    expect(excluded.code).toBe(0)
    expect(excluded.stdout).not.toContain('reference')
  })

  test('--max-const-len: a non-integer is a usage error (exit 2); a valid integer runs', async () => {
    const dir = stageVault('01-flat-uniform')
    const bad = await runCli(['init', dir, '--max-const-len', 'abc', '--dry-run'], { cwd: dir })
    expect(bad.code).toBe(2)
    expect(bad.stderr).toContain('--max-const-len')
    const ok = await runCli(['init', dir, '--max-const-len', '10', '--dry-run'], { cwd: dir })
    expect(ok.code).toBe(0)
  })

  test('--min-const-examples: a value below 1 is a usage error (exit 2); >= 1 runs', async () => {
    const dir = stageVault('01-flat-uniform')
    const bad = await runCli(['init', dir, '--min-const-examples', '0', '--dry-run'], { cwd: dir })
    expect(bad.code).toBe(2)
    expect(bad.stderr).toContain('--min-const-examples')
    const ok = await runCli(['init', dir, '--min-const-examples', '1', '--dry-run'], { cwd: dir })
    expect(ok.code).toBe(0)
  })

  test('reads at least one fixture so the temp-stage helper type-checks', () => {
    const dir = stageVault('01-flat-uniform')
    expect(readFileSync(join(dir, 'alpha.md'), 'utf8')).toContain('## Summary')
  })
})

describe('markdown-contract validate — run summary', () => {
  test("a clean --config run prints the run summary ABOVE 'No findings.' and still exits 0", async () => {
    const dir = stageVault('01-flat-uniform')
    // Scaffold a named-rule config so the summary has per-contract rows to render.
    const init = await runCli(['init', dir], { cwd: dir })
    expect(init.code).toBe(0)

    const r = await runCli(['validate', dir], { cwd: dir })
    expect(r.code).toBe(0) // accept-by-construction — a clean run

    // The run summary shows even on a clean run, and precedes the findings report.
    expect(r.stdout).toMatch(
      /^Scanned \d+ files?; \d+ matched across \d+ contracts?, \d+ unmatched/,
    )
    expect(r.stdout).toContain('No findings.')
    expect(r.stdout.indexOf('Scanned')).toBeLessThan(r.stdout.indexOf('No findings.'))
  })

  test('an inline --contract run prints the total WITHOUT per-contract rows (unnamed rule)', async () => {
    const dir = stageVault('01-flat-uniform')
    // Write the scaffold, then drive validate via the inline --contract form against that contract file.
    const init = await runCli(['init', dir], { cwd: dir })
    expect(init.code).toBe(0)
    const contractFile = readdirSync(dir).find((f) => f.endsWith('.contract.yaml'))
    expect(contractFile).toBeDefined()

    const r = await runCli(['validate', dir, '--contract', join(dir, contractFile!)], { cwd: dir })
    expect(r.code).toBe(0)
    // Total line present, but no `across K contracts` clause and no indented rows (the rule is unnamed).
    expect(r.stdout).toMatch(/^Scanned \d+ files?; \d+ matched, \d+ unmatched/)
    expect(r.stdout).not.toContain('across')
    expect(r.stdout).toContain('No findings.')
  })
})

describe('markdown-contract init — heading key-collision', () => {
  /** A fresh empty temp vault to write ad-hoc collision fixtures into. */
  function freshVault(): string {
    return tmp('mc-kcol-')
  }

  test('does not crash on key-colliding peer headings — exits 2 with a descriptive message', async () => {
    // Two case-variant headings as PEERS in one doc both key to `scheduleForToday`. This used to
    // escape as an uncaught ContractBuildError stack trace from the self-check; now it is a clean
    // exit-2 diagnostic naming the file.
    const dir = freshVault()
    writeFileSync(
      join(dir, 'both.md'),
      '## Schedule For today\n\nx\n\n## Schedule For Today\n\nx\n',
    )
    const r = await runCli(['init', dir, '--meta', '--force'], { cwd: dir })
    expect(r.code).toBe(2)
    expect(r.stderr).toContain('both.md')
    expect(r.stderr).toContain('scheduleForToday')
    expect(r.stdout).toBe('') // a crash would have produced no captured result at all
  })

  test('merges case-variant headings across docs and self-checks clean (exit 0, with a warning)', async () => {
    const dir = freshVault()
    writeFileSync(join(dir, 'mon.md'), '## Schedule For today\n\nx\n')
    writeFileSync(join(dir, 'tue.md'), '## Schedule For Today\n\nx\n')
    const r = await runCli(['init', dir, '--meta', '--force'], { cwd: dir })
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/warning: merged variant headings/)
    expect(r.stdout).toContain('self-check: clean')
  })
})
