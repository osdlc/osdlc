/**
 * `readPlugin`.
 *
 * Derives the model from a tiny fake plugin: a manifest, two skills and a
 * convention doc. One skill has an executable resource file next to it, the
 * other has a frontmatter key the model has a field for. The tests check the
 * normalization: frontmatter split into `description`/`allowedTools`, keys
 * with no field kept under `annotations`, resources kept with their executable
 * bit, documents read from `conventions/`, and everything sorted. Later suites cover the
 * Claude Code layouts: flat commands, plugin hooks, inline and referenced
 * manifest fields, the documents folder option, and secret redaction.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { readPlugin } from '../src/model/derive.ts'
import { HarnessModelSchema } from '../src/model/schema.ts'

let root: string

function seed(dir: string): void {
  // manifest
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
  writeFileSync(
    join(dir, '.claude-plugin', 'plugin.json'),
    `${JSON.stringify(
      { name: 'demo', version: '1.2.3', description: 'a demo harness', author: { name: 'acme' } },
      null,
      2,
    )}\n`,
  )

  // skill: task-work, with description, allowed-tools, an executable resource and a test (ignored)
  const tw = join(dir, 'skills', 'task-work')
  mkdirSync(tw, { recursive: true })
  writeFileSync(
    join(tw, 'SKILL.md'),
    '---\n' +
      'description: Do the work.\n' +
      'allowed-tools:\n  - Read\n  - Bash\n' +
      '---\n\n# task-work\n\nBody here.\n',
  )
  const script = join(tw, 'run.ts')
  writeFileSync(script, 'export const x = 1;\n')
  chmodSync(script, 0o755)
  mkdirSync(join(tw, 'tests'), { recursive: true })
  writeFileSync(join(tw, 'tests', 'run.test.ts'), '// ignored\n')

  // skill: setup, with the argument-hint frontmatter key
  const setup = join(dir, 'skills', 'setup')
  mkdirSync(setup, { recursive: true })
  writeFileSync(
    join(setup, 'SKILL.md'),
    '---\n' +
      'description: Set up.\n' +
      'allowed-tools: [Bash]\n' +
      'argument-hint: --dry-run\n' +
      '---\n\n# setup\n',
  )

  // a non-directory entry under skills/ is skipped
  writeFileSync(join(dir, 'skills', 'README.md'), '# skills\n')

  // convention doc
  mkdirSync(join(dir, 'conventions'), { recursive: true })
  writeFileSync(join(dir, 'conventions', 'commit-messages.md'), '# Commits\n')
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'harness-derive-'))
  seed(root)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('readPlugin', () => {
  test('derives metadata from the manifest', () => {
    const m = readPlugin(root)
    expect(m.metadata).toEqual({
      name: 'demo',
      version: '1.2.3',
      description: 'a demo harness',
      author: 'acme',
    })
    expect(m.modelVersion).toBe('2')
  })

  test('normalizes capability frontmatter and preserves unmodeled keys', () => {
    const m = readPlugin(root)
    // sorted by name: setup, task-work
    expect(m.capabilities.map((c) => c.name)).toEqual(['setup', 'task-work'])

    const taskWork = m.capabilities.find((c) => c.name === 'task-work')!
    expect(taskWork.kind).toBe('skill')
    expect(taskWork.description).toBe('Do the work.')
    expect(taskWork.allowedTools).toEqual(['Read', 'Bash'])
    expect(taskWork.instructions.trimEnd()).toBe('# task-work\n\nBody here.')
    expect(taskWork.annotations).toEqual({})

    const setup = m.capabilities.find((c) => c.name === 'setup')!
    expect(setup.allowedTools).toEqual(['Bash'])
    // argument-hint becomes its own field, not an annotation.
    expect(setup.argumentHint).toBe('--dry-run')
    expect(setup.annotations).toEqual({})
  })

  test('captures co-located resources with the executable bit, ignoring tests', () => {
    const m = readPlugin(root)
    const taskWork = m.capabilities.find((c) => c.name === 'task-work')!
    expect(taskWork.resources).toEqual([
      { path: 'run.ts', contents: 'export const x = 1;\n', executable: true },
    ])
  })

  test('reads conventions into documents', () => {
    const m = readPlugin(root)
    expect(m.documents).toEqual([{ name: 'commit-messages', body: '# Commits\n' }])
  })

  test('the derived model satisfies the schema', () => {
    const m = readPlugin(root)
    expect(() => HarnessModelSchema.parse(m)).not.toThrow()
  })
})

describe('readPlugin — lenient frontmatter framing', () => {
  // The parser (`parseFrontmatter` -> `splitLenient`) accepts a padded closing
  // fence and leading blank lines. The body split must agree, or the
  // frontmatter block ends up in `instructions`.
  test('a padded closing fence does not leak frontmatter into instructions', () => {
    const padded = join(root, 'skills', 'padded')
    mkdirSync(padded, { recursive: true })
    writeFileSync(
      join(padded, 'SKILL.md'),
      '---\ndescription: Padded fence.\nallowed-tools: [Bash]\n--- \n\n# padded\n\nBody.\n',
    )

    const cap = readPlugin(root).capabilities.find((c) => c.name === 'padded')!
    expect(cap.description).toBe('Padded fence.')
    expect(cap.allowedTools).toEqual(['Bash'])
    expect(cap.instructions).not.toContain('description: Padded fence.')
    expect(cap.instructions.trimEnd()).toBe('# padded\n\nBody.')
  })

  test('a leading blank line before the opening fence does not leak frontmatter', () => {
    const lead = join(root, 'skills', 'leading-blank')
    mkdirSync(lead, { recursive: true })
    writeFileSync(
      join(lead, 'SKILL.md'),
      '\n---\ndescription: Leading blank.\n---\n\n# leading-blank\n\nBody.\n',
    )

    const cap = readPlugin(root).capabilities.find((c) => c.name === 'leading-blank')!
    expect(cap.description).toBe('Leading blank.')
    expect(cap.instructions).not.toContain('description: Leading blank.')
    expect(cap.instructions.trimEnd()).toBe('# leading-blank\n\nBody.')
  })
})

describe('readPlugin — Claude Code plugin layouts', () => {
  test('a flat commands/<name>.md is a command', () => {
    mkdirSync(join(root, 'commands'), { recursive: true })
    writeFileSync(
      join(root, 'commands', 'hello.md'),
      '---\ndescription: Say hello.\nargument-hint: <who>\n---\n\nGreet $ARGUMENTS.\n',
    )

    const cmd = readPlugin(root).capabilities.find((c) => c.name === 'hello')!
    expect(cmd.kind).toBe('command')
    expect(cmd.description).toBe('Say hello.')
    expect(cmd.argumentHint).toBe('<who>')
    expect(cmd.instructions.trimEnd()).toBe('Greet $ARGUMENTS.')
    expect(cmd.resources).toEqual([])
  })

  test('a commands/<name>/SKILL.md folder wins over a flat file of the same name', () => {
    mkdirSync(join(root, 'commands', 'ship'), { recursive: true })
    writeFileSync(
      join(root, 'commands', 'ship', 'SKILL.md'),
      '---\ndescription: Folder.\n---\n\n# ship\n',
    )
    writeFileSync(join(root, 'commands', 'ship.md'), '---\ndescription: Flat.\n---\n\n# ship\n')

    const ships = readPlugin(root).capabilities.filter((c) => c.name === 'ship')
    expect(ships.map((c) => c.description)).toEqual(['Folder.'])
  })

  test('hooks/hooks.json supplies hooks', () => {
    mkdirSync(join(root, 'hooks'), { recursive: true })
    writeFileSync(
      join(root, 'hooks', 'hooks.json'),
      JSON.stringify({
        description: 'plugin hooks',
        hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'start.sh' }] }] },
      }),
    )

    expect(readPlugin(root).hooks).toEqual([{ event: 'SessionStart', action: 'start.sh' }])
  })

  test('plugin.json carries inline hooks and MCP servers', () => {
    writeFileSync(
      join(root, '.claude-plugin', 'plugin.json'),
      JSON.stringify({
        name: 'demo',
        version: '1.2.3',
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'stop.sh' }] }] },
        mcpServers: { docs: { command: 'docs-mcp', args: ['--stdio'] } },
      }),
    )

    const m = readPlugin(root)
    expect(m.hooks).toEqual([{ event: 'Stop', action: 'stop.sh' }])
    expect(m.mcpServers.map((s) => [s.name, s.command])).toEqual([['docs', 'docs-mcp']])
  })

  test('plugin.json can point at a hooks file and an MCP file inside the plugin', () => {
    mkdirSync(join(root, 'config'), { recursive: true })
    writeFileSync(
      join(root, 'config', 'h.json'),
      JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'stop.sh' }] }] } }),
    )
    writeFileSync(
      join(root, 'config', 'm.json'),
      JSON.stringify({ mcpServers: { docs: { command: 'docs-mcp' } } }),
    )
    writeFileSync(
      join(root, '.claude-plugin', 'plugin.json'),
      JSON.stringify({
        name: 'demo',
        version: '1',
        hooks: './config/h.json',
        mcpServers: ['./config/m.json'],
      }),
    )

    const m = readPlugin(root)
    expect(m.hooks.map((h) => h.action)).toEqual(['stop.sh'])
    expect(m.mcpServers.map((s) => s.name)).toEqual(['docs'])
  })

  test('a plugin.json path that leaves the plugin is ignored', () => {
    const outside = mkdtempSync(join(tmpdir(), 'harness-outside-'))
    try {
      const target = join(outside, 'h.json')
      writeFileSync(
        target,
        JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'evil.sh' }] }] } }),
      )
      writeFileSync(
        join(root, '.claude-plugin', 'plugin.json'),
        JSON.stringify({ name: 'demo', version: '1', hooks: [relative(root, target), target] }),
      )

      expect(readPlugin(root).hooks).toEqual([])
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  test('a plugin.json path through a symlink that points outside the plugin is ignored', () => {
    const outside = mkdtempSync(join(tmpdir(), 'harness-outside-'))
    try {
      writeFileSync(
        join(outside, 'h.json'),
        JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'evil.sh' }] }] } }),
      )
      symlinkSync(join(outside, 'h.json'), join(root, 'link.json'))
      writeFileSync(
        join(root, '.claude-plugin', 'plugin.json'),
        JSON.stringify({ name: 'demo', version: '1', hooks: './link.json' }),
      )

      expect(readPlugin(root).hooks).toEqual([])
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  test('a plugin.json path through a symlink that stays inside the plugin is read', () => {
    writeFileSync(
      join(root, 'real.json'),
      JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'stop.sh' }] }] } }),
    )
    symlinkSync(join(root, 'real.json'), join(root, 'link.json'))
    writeFileSync(
      join(root, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'demo', version: '1', hooks: './link.json' }),
    )

    expect(readPlugin(root).hooks.map((h) => h.action)).toEqual(['stop.sh'])
  })

  test('a file inside the plugin whose name starts with two dots is read', () => {
    writeFileSync(
      join(root, '..x.json'),
      JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'stop.sh' }] }] } }),
    )
    writeFileSync(
      join(root, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'demo', version: '1', hooks: './..x.json' }),
    )

    expect(readPlugin(root).hooks.map((h) => h.action)).toEqual(['stop.sh'])
  })

  test('a project-scope MCP server replaces the same-named plugin.json server', () => {
    writeFileSync(
      join(root, '.claude-plugin', 'plugin.json'),
      JSON.stringify({
        name: 'demo',
        version: '1',
        mcpServers: { docs: { command: 'from-manifest' }, extra: { command: 'only-manifest' } },
      }),
    )
    writeFileSync(
      join(root, '.mcp.json'),
      JSON.stringify({ mcpServers: { docs: { command: 'from-mcp-json' } } }),
    )

    const byName = Object.fromEntries(readPlugin(root).mcpServers.map((s) => [s.name, s]))
    expect(byName['docs']!.command).toBe('from-mcp-json')
    expect(byName['extra']!.command).toBe('only-manifest')
  })

  test('a plugin.json that is valid JSON but not an object gives the placeholder metadata', () => {
    writeFileSync(join(root, '.claude-plugin', 'plugin.json'), 'null')
    const m = readPlugin(root)
    expect(m.metadata.name).toBe('harness')
    expect(m.metadata.version).toBe('unknown')
  })

  test('plugin hooks and settings hooks both appear, without repeats', () => {
    mkdirSync(join(root, 'hooks'), { recursive: true })
    const stop = { Stop: [{ hooks: [{ type: 'command', command: 'stop.sh' }] }] }
    writeFileSync(join(root, 'hooks', 'hooks.json'), JSON.stringify({ hooks: stop }))
    mkdirSync(join(root, '.claude'), { recursive: true })
    writeFileSync(
      join(root, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          ...stop,
          SessionStart: [{ hooks: [{ type: 'command', command: 'start.sh' }] }],
        },
      }),
    )

    expect(readPlugin(root).hooks.map((h) => h.action)).toEqual(['start.sh', 'stop.sh'])
  })

  test('documentsDir picks the documents folder', () => {
    mkdirSync(join(root, 'docs', 'nested'), { recursive: true })
    writeFileSync(join(root, 'docs', 'nested', 'guide.md'), '# Guide\n')
    writeFileSync(join(root, 'docs', 'notes.txt'), 'not markdown')

    const m = readPlugin(root, { documentsDir: 'docs' })
    expect(m.documents).toEqual([{ name: 'nested/guide', body: '# Guide\n' }])
  })

  test('a missing manifest gives the placeholder metadata', () => {
    rmSync(join(root, '.claude-plugin'), { recursive: true })
    const m = readPlugin(root)
    expect(m.metadata.name).toBe('harness')
    expect(m.metadata.version).toBe('unknown')
  })
})

describe('readPlugin — secrets', () => {
  function seedSecrets(): void {
    writeFileSync(
      join(root, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          api: { command: 'api-mcp', env: { API_KEY: 'sk-live-123', MODE: 'prod' } },
          web: {
            type: 'http',
            url: 'https://user:hunter2@mcp.example/sse?token=abc&v=2',
            headers: { Authorization: 'Bearer abc' },
          },
          tokenUser: { type: 'http', url: 'https://ghp_SECRET@mcp.example/mcp' },
        },
      }),
    )
  }

  test('redacts env, header and URL secrets by default and keeps the keys', () => {
    seedSecrets()
    const json = JSON.stringify(readPlugin(root))
    for (const secret of ['sk-live-123', 'hunter2', 'Bearer abc', 'token=abc', 'ghp_SECRET']) {
      expect(json).not.toContain(secret)
    }
    const m = readPlugin(root)
    const api = m.mcpServers.find((s) => s.name === 'api')!
    expect(api.env).toEqual({ API_KEY: '<redacted>', MODE: '<redacted>' })
    const web = m.mcpServers.find((s) => s.name === 'web')!
    expect(web.headers).toEqual({ Authorization: '<redacted>' })
    expect(web.url).toBe('https://<redacted>@mcp.example/sse?token=<redacted>&v=<redacted>')
    const tokenUser = m.mcpServers.find((s) => s.name === 'tokenUser')!
    expect(tokenUser.url).toBe('https://<redacted>@mcp.example/mcp')
  })

  test('includeValues keeps the values as written', () => {
    seedSecrets()
    const m = readPlugin(root, { includeValues: true })
    const api = m.mcpServers.find((s) => s.name === 'api')!
    expect(api.env).toEqual({ API_KEY: 'sk-live-123', MODE: 'prod' })
    const web = m.mcpServers.find((s) => s.name === 'web')!
    expect(web.headers).toEqual({ Authorization: 'Bearer abc' })
    expect(web.url).toBe('https://user:hunter2@mcp.example/sse?token=abc&v=2')
  })
})
