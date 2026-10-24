/**
 * The anti-drift suite for the `guide` command. Nothing here asserts on
 * wording: each test derives the fact from the source (the flags the parser
 * accepts, the keys the config schema declares, the built-in tools) and
 * asserts the guide agrees.
 */

import { describe, expect, test } from 'vitest'

import { captureIo } from '@osdlc/cli-tool'
import { builtins } from '@osdlc/system-model/builtins'

import { BIN } from '../src/app.ts'
import { CONFIG_KEYS } from '../src/config.ts'
import { GUIDE_TOPICS, guideDocument, guideSection, type GuideTool } from '../src/guide.ts'

/** The CLI's `main`. */
export type GuideMain = (
  argv: string[],
  env: Record<string, string | undefined>,
  home: string,
  io: ReturnType<typeof captureIo>,
) => Promise<number>

/**
 * Flags the guide may name that the top-level parser does not take, each with
 * a reason: subcommand flags, parsed by their own command.
 */
export const FLAG_SKIP: readonly string[] = [
  // `way trust --untrust` / `--show`, parsed by trust-command.ts.
  '--untrust',
  '--show',
  // `way config set ... --user`, parsed by config-command.ts.
  '--user',
]

/**
 * Backticked tokens in the config section that are key-SHAPED but are not
 * settings. Only filenames qualify: a dotted lowercase filename is
 * indistinguishable from a dotted setting name by pattern alone.
 */
const NON_KEY_TOKENS = new Set(['wayfinder.config.json', 'waypost.config.json'])

/**
 * Every flag token in a block of text.
 *
 * A single dash is only ever followed by ONE letter here (`-C`, `-h`), so
 * requiring that keeps ordinary hyphenated prose — a `*`-prefixed suffix — from
 * reading as a flag. Double-dash tokens are taken whole.
 */
export function flagTokens(text: string): Set<string> {
  return new Set(text.match(/(?<![\w-])(?:--[A-Za-z][A-Za-z0-9-]*|-[A-Za-z](?![\w-]))/g) ?? [])
}

/** Every flag the tool's rendered help lists in its options block. */
export function acceptedFlags(usage: string): Set<string> {
  // The tool's own rendered help, which `defineCli` generates from the flag
  // declaration — so this compares the guide against what the parser really
  // takes, not against a second list that could disagree with it. Only the
  // options block is scanned: the prose below it names flags of the
  // SUBCOMMANDS, which this tool's top-level parser does not accept.
  const options = usage.split(/^Options:$/m)[1] ?? ''
  const upTo = options.split(/\n\n/)[0] ?? ''
  return new Set([...upTo.matchAll(/(?<![\w-])(--?[A-Za-z][\w-]*)/g)].map((m) => m[1] as string))
}

export function backticked(text: string): string[] {
  return [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1] as string)
}

/** The trust section's line naming the exec-kind built-ins. */
function trustExecLine(section: string): string {
  const line = section.split('\n').find((l) => l.startsWith('Built-ins that must shell out: '))
  expect(line).toBeDefined()
  return line as string
}

/**
 * Register the whole suite for one tool.
 *
 * What the tool "really accepts" is read from its own rendered help, which is
 * generated from the flag declaration.
 */
export function guideSuite(tool: GuideTool, main: GuideMain): void {
  describe(`${BIN} guide`, () => {
    test('its prose never names a flag the parser does not take', () => {
      const skip = new Set(FLAG_SKIP)
      const accepted = acceptedFlags(tool.usage)
      expect(accepted.size).toBeGreaterThan(0)

      // Every section EXCEPT usage. The usage section is `tool.usage` itself,
      // which `defineCli` renders from the flag declaration — comparing it
      // against flags derived from that same string would assert nothing.
      // The prose around it is written by hand, and that is what can drift:
      // a renamed flag, or one that never existed.
      const prose = GUIDE_TOPICS.filter((t) => t !== 'usage')
        .map((t) => guideSection(t, tool))
        .join('\n')
      const invented = [...flagTokens(prose)].filter((f) => !accepted.has(f) && !skip.has(f))
      expect(invented.sort()).toEqual([])
    })

    test('the usage section is the live help, so it cannot omit a flag', () => {
      // The other half of the old both-directions check. It is now structural
      // rather than asserted: `guide usage` prints the same string `--help`
      // does, and both come from the declaration.
      expect(guideSection('usage', tool)).toContain(tool.usage.trim())
    })

    test('names exactly the settable config keys', () => {
      const section = guideSection('config', tool)
      const mentioned = backticked(section)
        .filter((t) => /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$/.test(t))
        .filter((t) => !NON_KEY_TOKENS.has(t))

      for (const token of mentioned) expect(CONFIG_KEYS).toContain(token)
      for (const key of CONFIG_KEYS) expect(mentioned).toContain(key)
    })

    test('lists exactly the built-in runners, in array order', () => {
      // A new built-in runner must already be named.
      const line = guideSection('usage', tool)
        .split('\n')
        .find((l) => l.startsWith('Built-in runners: '))
      expect(line).toBeDefined()
      expect(backticked(line as string)).toEqual(
        builtins.filter((t) => t.roles.runner !== undefined).map((t) => t.id),
      )
    })

    test('names every runner that must shell out to be read', () => {
      const line = trustExecLine(guideSection('trust', tool))
      expect(backticked(line)).toEqual(
        builtins.filter((t) => t.roles.runner?.kind === 'exec').map((t) => t.id),
      )
    })

    test("the json section's example is valid JSON", () => {
      const fence = guideSection('json', tool).match(/```json\n([\s\S]*?)\n```/)
      expect(fence).not.toBeNull()
      expect(() => JSON.parse((fence as RegExpMatchArray)[1] as string)).not.toThrow()
    })

    test('no argument prints every section heading', async () => {
      const io = captureIo()
      expect(await main(['guide'], {}, '/nonexistent-home', io)).toBe(0)
      for (const topic of GUIDE_TOPICS) expect(io.out).toContain(`## ${topic}`)
      expect(io.err).toBe('')
      expect(io.out).toBe(guideDocument(tool))
    })

    test('a topic prints that section and nothing else', async () => {
      for (const topic of GUIDE_TOPICS) {
        const io = captureIo()
        expect(await main(['guide', topic], {}, '/nonexistent-home', io)).toBe(0)
        expect(io.out).toBe(guideSection(topic, tool))
        for (const other of GUIDE_TOPICS) {
          if (other !== topic) expect(io.out).not.toContain(`## ${other}`)
        }
      }
    })

    test('`topics` lists exactly GUIDE_TOPICS', async () => {
      const io = captureIo()
      expect(await main(['guide', 'topics'], {}, '/nonexistent-home', io)).toBe(0)
      expect(io.out.trim().split('\n')).toEqual([...GUIDE_TOPICS])
    })

    test('--help prints a short usage, not the document', async () => {
      for (const flag of ['-h', '--help']) {
        const io = captureIo()
        expect(await main(['guide', flag], {}, '/nonexistent-home', io)).toBe(0)
        expect(io.out).toContain(`${BIN} guide`)
        expect(io.out).not.toContain('## extend')
        expect(io.err).toBe('')
      }
    })

    test('an unknown topic is exit 2 on stderr, with the topic list', async () => {
      const io = captureIo()
      expect(await main(['guide', 'bogus'], {}, '/nonexistent-home', io)).toBe(2)
      expect(io.out).toBe('')
      expect(io.err).toContain('bogus')
      for (const topic of GUIDE_TOPICS) expect(io.err).toContain(topic)
    })

    test('more than one topic is the same error path', async () => {
      const io = captureIo()
      expect(await main(['guide', 'usage', 'config'], {}, '/nonexistent-home', io)).toBe(2)
      expect(io.out).toBe('')
      expect(io.err).toContain('at most one topic')
    })
  })
}
