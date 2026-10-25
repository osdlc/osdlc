/**
 * just — https://just.systems
 *
 * Two paths, because its callers need different things:
 *
 *   --dump   `just --dump --dump-format json` gives doc attributes, typed
 *            parameters with defaults, private flags and aliases. Accurate,
 *            but needs the binary.
 *   regex    scan recipe headers at column 0. Names only, but works on a
 *            machine with no `just` installed. The sdlc quality service
 *            depends on that, and it is also the case for a checkout on a new
 *            machine.
 *
 * The regex fallback is why this can be a `parse` runner. It is always
 * available. The dump is tried per justfile, and any failure (a non-zero exit,
 * unparseable JSON) falls back to the scan for that file, with a diagnostic
 * saying why. So a caller never gets less data than it expects without being
 * told.
 */

import { dirname } from 'node:path'

import { firstLine, stderrOrError } from '@osdlc/command-seam'

import type { ProviderContext } from '../../contract.ts'
import type {
  Diagnostic,
  Param,
  ParametersUnknownReason,
  ProviderResult,
  RunnerBrand,
  Task,
} from '../../model.ts'
import { paramShape } from '../../params.ts'
import type { RunnerRole } from '../../tool.ts'
import { looksPersistent, onePerDir, sourcesOf, taskId } from '../support/shared.ts'

/** The names just looks for. */
export const JUSTFILE_NAMES = ['justfile', 'Justfile', '.justfile']

const CHAIN = [
  {
    label: 'runner',
    hint: 'just runs recipes declared in a justfile — the deterministic command tails a repo shares between humans, hooks and CI.',
  },
  {
    label: 'justfile',
    hint: 'Which justfile declares the recipe. `.` is the one at the root; others are addressed with -f and -d.',
  },
  {
    label: 'recipe',
    hint: 'The recipe name. Any <required> / [optional] / *variadic parameters follow it.',
  },
]

interface JustRecipe {
  name: string
  namepath?: string
  doc?: string | null
  private?: boolean
  parameters?: { name: string; kind?: string; default?: string | null }[]
  body?: unknown[][]
}

/**
 * just's exclamation-point logo from just.systems, a mark of the just
 * project, used here only to identify the tool. Icon
 * path: simple-icons v16 (CC0), slug `just`. simple-icons lists plain
 * black for it, so the color stays GitHub Linguist's Just color.
 */
const BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0m0 2.35a3.25 3.35 0 0 1 3.25 3.35A3.25 3.35 0 0 1 12 9.05 3.25 3.35 0 0 1 8.75 5.7 3.25 3.35 0 0 1 12 2.35m0 12.6a3.25 3.35 0 0 1 3.25 3.35A3.25 3.35 0 0 1 12 21.65a3.25 3.35 0 0 1-3.25-3.35A3.25 3.35 0 0 1 12 14.95"/></svg>',
  color: '#384d54',
}

export const justRunner: RunnerRole = {
  // `parse`, not `exec`: the regex path means this runner always has tasks to
  // offer. It runs just when allowed, and says when it did not.
  kind: 'parse',
  probe: { timeoutMs: 10_000, cost: 'cheap' },
  chain: CHAIN,
  brand: BRAND,

  async collect(ctx, packages): Promise<ProviderResult> {
    const justfiles = onePerDir(sourcesOf(packages, 'just', JUSTFILE_NAMES))

    if (justfiles.length === 0) {
      return { status: 'absent', tasks: [], diagnostics: [] }
    }

    const diagnostics: Diagnostic[] = []
    const tasks: Task[] = []
    // `ctx.which`, not a `--version` call: a PATH lookup answers the same
    // question without starting a process.
    const usable = ctx.allowExec && ctx.which('just') !== null

    if (!usable && ctx.allowExec) {
      diagnostics.push({
        severity: 'warning',
        message:
          '`just` is not on the PATH — recipes were parsed from source, so docs, parameters and private flags are missing',
      })
    }

    for (const file of justfiles) {
      const dir = dirname(file) === '.' ? '.' : dirname(file)
      let unknown: ParametersUnknownReason = ctx.allowExec ? 'tool-missing' : 'exec-withheld'
      if (usable) {
        const parsed = await dumpRecipes(ctx, file)
        if (parsed.error === undefined) {
          for (const recipe of parsed.recipes) {
            if (recipe.private) continue
            tasks.push(fromDump(recipe, file, dir))
          }
          continue
        }
        // A failed dump falls back to the scan for this file instead of
        // dropping its recipes. A justfile whose `import` target is missing
        // exits non-zero, but its recipes are still real and runnable. Turning
        // execution on must never make the list shorter.
        diagnostics.push({
          severity: 'warning',
          message: `\`just --dump\` did not answer for this file (${parsed.error}) — recipes were parsed from source, so docs, parameters and private flags are missing`,
          source: file,
        })
        unknown = 'tool-failed'
      }

      const text = await ctx.readText(file)
      if (text === null) {
        diagnostics.push({ severity: 'error', message: 'unreadable', source: file })
        continue
      }
      for (const name of scanRecipeNames(text)) {
        tasks.push(fromScan(name, file, dir, unknown))
      }
    }

    return {
      status: 'ok',
      tasks,
      diagnostics,
    }
  },
}

async function dumpRecipes(
  ctx: ProviderContext,
  file: string,
): Promise<{ recipes: JustRecipe[]; error?: string }> {
  const res = await ctx
    .runner('just')
    .run(['--justfile', file, '--dump', '--dump-format', 'json'], {
      cwd: ctx.root,
      signal: ctx.signal,
    })
  if (res.exitCode !== 0) {
    return { recipes: [], error: firstLine(stderrOrError(res), 'unknown failure') }
  }
  try {
    const parsed = JSON.parse(res.stdout) as { recipes?: Record<string, JustRecipe> }
    return { recipes: Object.values(parsed.recipes ?? {}) }
  } catch (err) {
    return { recipes: [], error: `unparseable --dump output: ${String(err)}` }
  }
}

/**
 * `argv` names the justfile explicitly, so it works from the catalog root
 * whichever justfile it came from. The root justfile skips the flags because
 * the bare form is what a person would type.
 */
function baseArgv(file: string, dir: string): string[] {
  return dir === '.' ? ['just'] : ['just', '--justfile', file, '--working-directory', dir]
}

function fromDump(recipe: JustRecipe, file: string, dir: string): Task {
  const name = recipe.namepath ?? recipe.name
  const parameters = (recipe.parameters ?? []).map(toParam)
  const argv = [...baseArgv(file, dir), name]
  return {
    id: taskId('just', file, name),
    runner: 'just',
    path: ['just', dir, name],
    argv,
    cwd: '.',
    // Placeholders appear only here. `argv` above runs as it is.
    display: `${argv.join(' ')}${renderParams(parameters)}`,
    parameters,
    source: file,
    origin: 'declared',
    ...(recipe.doc ? { doc: recipe.doc } : {}),
    ...(bodyPreview(recipe.body) ? { detail: bodyPreview(recipe.body) } : {}),
    tags: ['just', dir === '.' ? 'root' : dir],
    persistent: { value: looksPersistent(name), declared: false },
    executes: 'local',
  }
}

function fromScan(name: string, file: string, dir: string, unknown: ParametersUnknownReason): Task {
  const argv = [...baseArgv(file, dir), name]
  return {
    id: taskId('just', file, name),
    runner: 'just',
    path: ['just', dir, name],
    argv,
    cwd: '.',
    display: argv.join(' '),
    // The scan cannot see parameters, so it says so.
    parameters: [],
    parametersUnknown: unknown,
    source: file,
    origin: 'declared',
    tags: ['just', dir === '.' ? 'root' : dir],
    persistent: { value: looksPersistent(name), declared: false },
    executes: 'local',
  }
}

function toParam(p: { name: string; kind?: string; default?: string | null }): Param {
  const variadic = p.kind === 'star' || p.kind === 'plus'
  return {
    name: p.name,
    // A `+variadic` needs at least one argument; a `*variadic` accepts none.
    required: p.kind === 'plus' || (!variadic && p.default == null),
    variadic,
    ...(p.default != null ? { default: p.default } : {}),
  }
}

/** Parameters in the shape just's own `--list` uses, spaced off the command. */
function renderParams(params: Param[]): string {
  const shape = paramShape(params)
  return shape === '' ? '' : ` ${shape}`
}

/**
 * Recipe headers at column 0. Indented lines are recipe bodies and a leading
 * `#` is a comment, both filtered by the caller.
 *
 * Wide on purpose. A pattern that requires the line to end at the colon, with
 * a narrow character class before it, finds only 91 of this repo's 110
 * recipes. It misses two common forms:
 *
 *     release-lib lib bump *flags:      `*` must be in the character class
 *     ci base="main": ci-guards         text after the colon must not end it
 *
 * `:(?!=)` keeps assignments out: `alias b := build` and `set shell := [...]`
 * are not recipes.
 */
const RECIPE_HEADER = /^@?([a-zA-Z_][a-zA-Z0-9_-]*)(?:\s+[^:\n]*?)?:(?!=)/

export function scanRecipeNames(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    if (!raw || raw[0] === ' ' || raw[0] === '\t' || raw[0] === '#') continue
    const m = RECIPE_HEADER.exec(raw)
    const name = m?.[1]
    if (name === undefined || seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

/**
 * First line of a recipe body. just's dump encodes a line as an array of string
 * literals and `["variable", name]` pairs; interpolations render back as
 * `{{name}}` so the preview reads like the source.
 */
function bodyPreview(body: JustRecipe['body']): string | undefined {
  const first = body?.[0]
  if (!Array.isArray(first)) return undefined
  const text = first
    .map((piece) => {
      if (typeof piece === 'string') return piece
      if (Array.isArray(piece)) {
        return piece
          .map((frag) =>
            Array.isArray(frag) && frag[0] === 'variable' ? `{{${String(frag[1])}}}` : '',
          )
          .join('')
      }
      return ''
    })
    .join('')
    .trim()
  return text.length > 0 ? text : undefined
}
