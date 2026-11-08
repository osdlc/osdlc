import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'vitest'

import { containedPath } from '../../src/cli/contain.js'
import { UsageError } from '../../src/cli/errors.js'
import { parseInputs } from '../../src/cli/inputs.js'
import { main, strictViolations } from '../../src/cli/main.js'
import { parseSpecText, resolveCall, substitute } from '../../src/cli/spec-file.js'

// No agent CLI is spawned: every main() call here uses --dry-run or fails first.

const dir = mkdtempSync(join(tmpdir(), 'agent-call-cli-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
mkdirSync(join(dir, 'prompts'))
writeFileSync(join(dir, 'prompts', 'p.md'), 'You answer questions.')
writeFileSync(join(dir, 'ctx.txt'), 'CONTEXT BODY')
writeFileSync(
  join(dir, 'spec.yml'),
  `setup: { harness: claude, plugins: [craft@osdlc] }
run:
  model: m-1
  permissions: { mode: read-only, allowTools: [Read, Grep] }
  prompt:
    - file: prompts/p.md
    - text: "About PR {{pr}}."
    - input: request
  context:
    - input: pr-context
`,
)

async function cli(args: string[]) {
  let out = ''
  let err = ''
  const code = await main(args, {
    cwd: dir,
    stdout: (t) => (out += t),
    stderr: (t) => (err += t),
  })
  return { code, out, err }
}

const baseArgs = [
  'run',
  'spec.yml',
  '--dry-run',
  '--input',
  'pr=7',
  '--input',
  'request=hello',
  '--input',
  'pr-context=@ctx.txt',
]

describe('spec loading', () => {
  test('parses YAML and JSON alike', () => {
    const yml = parseSpecText('run:\n  prompt:\n    - text: hi\n', '.yml')
    const json = parseSpecText('{"run":{"prompt":[{"text":"hi"}]}}', '.json')
    expect(yml).toEqual(json)
  })

  test('rejects unknown fields, bad parts and a missing run section', () => {
    expect(() => parseSpecText('setup: {}', '.yml')).toThrow(/no run/)
    expect(() => parseSpecText('run:\n  bogus: 1\n  prompt: []', '.yml')).toThrow(
      /unknown run.bogus/,
    )
    expect(() => parseSpecText('run:\n  prompt:\n    - {text: a, file: b}', '.yml')).toThrow(
      /exactly one key/,
    )
    expect(() => parseSpecText('run:\n  prompt: []', '.yml')).toThrow(/at least one/)
    expect(() =>
      parseSpecText('run:\n  permissions: {mode: nope}\n  prompt: [{text: a}]', '.yml'),
    ).toThrow(/mode must be/)
  })
})

describe('path containment', () => {
  test('allows paths under root', () => {
    expect(containedPath('/r', 'a/b.md')).toBe('/r/a/b.md')
    expect(containedPath('/r', 'a/../b.md')).toBe('/r/b.md')
  })
  test('rejects escapes and absolute paths', () => {
    expect(() => containedPath('/r', '../x')).toThrow(UsageError)
    expect(() => containedPath('/r', 'a/../../x')).toThrow(/escapes/)
    expect(() => containedPath('/r', '/etc/passwd')).toThrow(/absolute/)
  })
  test('a file: part outside root fails resolution', () => {
    const run = parseSpecText('run:\n  prompt: [{file: ../secret}]', '.yml')
    expect(() => resolveCall(run, dir, new Map())).toThrow(/escapes/)
  })
})

describe('working directory', () => {
  test('the agent does not run in --root', () => {
    const run = parseSpecText('run:\n  prompt:\n    - file: prompts/p.md\n', '.yml')
    expect(resolveCall(run, dir, new Map()).spec.cwd).toBeUndefined()
  })
})

describe('inputs and placeholders', () => {
  test('parses literals and @file', () => {
    const inputs = parseInputs(['a=1', 'b=x=y', 'c=@ctx.txt'], dir)
    expect(inputs.get('a')).toEqual({ value: '1' })
    expect(inputs.get('b')?.value).toBe('x=y')
    expect(inputs.get('c')).toEqual({ value: 'CONTEXT BODY', path: join(dir, 'ctx.txt') })
  })
  test('rejects malformed, duplicate and unreadable inputs', () => {
    expect(() => parseInputs(['nope'], dir)).toThrow(/name=value/)
    expect(() => parseInputs(['a=1', 'a=2'], dir)).toThrow(/twice/)
    expect(() => parseInputs(['a=@missing.txt'], dir)).toThrow(/cannot read/)
  })
  test('substitutes known placeholders, errors on unknown', () => {
    const inputs = parseInputs(['pr=7'], dir)
    expect(substitute('PR {{pr}} and {{ pr }}', inputs)).toBe('PR 7 and 7')
    expect(() => substitute('{{nope}}', inputs)).toThrow(/nope/)
  })
  test('missing input part and non-file context input are errors', () => {
    const run = parseSpecText('run:\n  prompt: [{input: q}]', '.yml')
    expect(() => resolveCall(run, dir, new Map())).toThrow(/missing required input "q"/)
    const ctx = parseSpecText('run:\n  prompt: [{text: a}]\n  context: [{input: c}]', '.yml')
    expect(() => resolveCall(ctx, dir, parseInputs(['c=text'], dir))).toThrow(/must be a file/)
  })
  test('joins prompt parts with a blank line and maps context', () => {
    const run = parseSpecText(
      'run:\n  maxTurns: 5\n  prompt: [{file: prompts/p.md}, {text: "n {{n}}"}]\n  context: [{file: ctx.txt}, {input: c}]',
      '.yml',
    )
    const { spec, unsupported } = resolveCall(run, dir, parseInputs(['n=1', 'c=@ctx.txt'], dir))
    expect(spec.prompt).toBe('You answer questions.\n\nn 1')
    expect(spec.context?.files).toEqual([join(dir, 'ctx.txt'), join(dir, 'ctx.txt')])
    expect(spec.limits).toEqual({ maxTurns: 5 })
    expect(unsupported).toEqual([])
  })
})

describe('strict detection', () => {
  test('flags approximated and dropped, not native or emulated', () => {
    const notes = (['native', 'emulated', 'approximated', 'dropped'] as const).map((support) => ({
      field: support,
      support,
      detail: '',
    }))
    expect(strictViolations(notes).map((n) => n.support)).toEqual(['approximated', 'dropped'])
  })

  test('strict spec with maxTurns exits 3 on an agent with no turn limit', async () => {
    writeFileSync(
      join(dir, 'strict.yml'),
      'run:\n  agent: codex\n  strict: true\n  maxTurns: 3\n  prompt: [{text: hi}]\n',
    )
    const r = await cli(['run', 'strict.yml'])
    expect(r.code).toBe(3)
    expect(r.err).toMatch(/strict mode refused[\s\S]*maxTurns/)
    expect(r.out).toBe('')
  })

  test('maxTurns reaches the plan: native on claude, so strict passes', async () => {
    writeFileSync(
      join(dir, 'turns.yml'),
      'run:\n  agent: claude\n  strict: true\n  maxTurns: 3\n  prompt: [{text: hi}]\n',
    )
    const r = await cli(['run', 'turns.yml', '--dry-run'])
    expect(r.code).toBe(0)
    expect(r.err).toMatch(/"--max-turns","3"/)
  })

  test('strict spec with a dropped field on cursor exits 3', async () => {
    writeFileSync(
      join(dir, 'strict2.yml'),
      'run:\n  strict: true\n  permissions: {mode: read-only, allowTools: [Read]}\n  prompt: [{text: hi}]\n',
    )
    const r = await cli(['run', 'strict2.yml', '--agent', 'cursor', '--dry-run'])
    expect(r.code).toBe(3)
    expect(r.err).toMatch(/allowTools|permissions/)
  })
})

describe('--dry-run', () => {
  for (const agent of ['claude', 'codex', 'cursor']) {
    test(`explains the ${agent} call and exits 0`, async () => {
      const r = await cli([...baseArgs, '--agent', agent])
      expect(r.code).toBe(0)
      expect(r.out).toBe('')
      expect(r.err).toContain(`agent: ${agent}`)
      expect(r.err).toContain('argv: [')
      expect(r.err).toContain('notes:')
      expect(r.err).not.toContain('CONTEXT BODY')
    })
  }

  test('defaults the agent to setup.harness', async () => {
    const r = await cli(baseArgs)
    expect(r.code).toBe(0)
    expect(r.err).toContain('agent: claude')
    expect(r.err).toContain('"--model"')
  })

  test('usage errors exit 2', async () => {
    expect((await cli([])).code).toBe(2)
    expect((await cli(['run', 'spec.yml', '--dry-run'])).err).toMatch(/\{\{pr\}\}|missing/)
    expect((await cli(['run', 'spec.yml', '--agent', 'nope', ...baseArgs.slice(2)])).code).toBe(2)
  })
})
