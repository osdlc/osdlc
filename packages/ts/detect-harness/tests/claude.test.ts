/**
 * The Claude Code provider against a fixture home, project and system root:
 * settings precedence, permissions, plugins and marketplaces from the
 * registries, plugin contents, MCP scopes, skills, commands, agents,
 * instructions and sign-in evidence.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdirSync, symlinkSync } from 'node:fs'
import { basename, join } from 'node:path'

import { REDACTED } from '../src/read/redact.ts'
import { fixture, type Fixture } from './fixture.ts'

let f: Fixture

beforeEach(() => {
  f = fixture()
})

afterEach(() => {
  f.cleanup()
})

const managedDir = (): string => join(f.system, 'etc', 'claude-code')

describe('settings', () => {
  test('permission rules add up across scopes; the highest scope sets defaultMode', async () => {
    f.write(f.home, {
      '.claude/settings.json': {
        permissions: { allow: ['Read'], defaultMode: 'default' },
      },
    })
    f.write(f.project, {
      '.claude/settings.json': { permissions: { deny: ['Bash(rm *)'] } },
      '.claude/settings.local.json': {
        permissions: { ask: ['Write'], defaultMode: 'acceptEdits' },
      },
    })
    const r = await f.report('claude')
    expect(r.permissions.rules.map((x) => [x.kind, x.rule, x.scope])).toEqual([
      ['allow', 'Read', 'user'],
      ['deny', 'Bash(rm *)', 'project'],
      ['ask', 'Write', 'local'],
    ])
    expect(r.permissions.defaultMode).toBe('acceptEdits')
    expect(r.permissions.defaultModeSource).toBe(join(f.project, '.claude', 'settings.local.json'))
    expect(r.status).toBe('ok')
  })

  test('managed settings win over local', async () => {
    f.write(managedDir(), {
      'managed-settings.json': { permissions: { defaultMode: 'plan', deny: ['WebFetch'] } },
    })
    f.write(f.project, {
      '.claude/settings.local.json': { permissions: { defaultMode: 'bypassPermissions' } },
    })
    const r = await f.report('claude')
    expect(r.permissions.defaultMode).toBe('plan')
    expect(r.permissions.rules).toContainEqual({
      kind: 'deny',
      rule: 'WebFetch',
      scope: 'managed',
      source: join(managedDir(), 'managed-settings.json'),
    })
  })

  test('the managed folder follows the platform', async () => {
    f.write(join(f.system, 'Library', 'Application Support', 'ClaudeCode'), {
      'managed-settings.json': { permissions: { allow: ['Glob'] } },
    })
    const r = await f.report('claude', { platform: 'darwin' })
    expect(r.permissions.rules.map((x) => x.rule)).toEqual(['Glob'])
  })

  test('every settings file is a source with its rank; a broken one is an error and a warning', async () => {
    f.write(f.project, { '.claude/settings.json': '{ not json' })
    const r = await f.report('claude')
    const settings = r.sources.filter((s) => s.kind === 'settings')
    expect(settings.map((s) => [s.scope, s.rank, s.status])).toEqual([
      ['user', 1, 'absent'],
      ['project', 2, 'error'],
      ['local', 3, 'absent'],
      ['managed', 4, 'absent'],
    ])
    expect(
      r.diagnostics.some((d) => d.severity === 'warning' && d.message.includes('not valid JSON')),
    ).toBe(true)
  })

  test('settings hooks keep their scope and source', async () => {
    f.write(f.project, {
      '.claude/settings.json': {
        hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'lint' }] }] },
      },
    })
    const r = await f.report('claude')
    expect(r.hooks).toEqual([
      {
        event: 'PreToolUse',
        matcher: 'Bash',
        type: 'command',
        command: 'lint',
        timeout: null,
        scope: 'project',
        origin: 'project',
        source: join(f.project, '.claude', 'settings.json'),
        trust: null,
      },
    ])
  })

  test('CLAUDE_CONFIG_DIR moves the user folder and the global state file', async () => {
    const alt = join(f.root, 'alt-claude')
    f.write(alt, {
      'settings.json': { permissions: { allow: ['Alt'] } },
      '.claude.json': { mcpServers: { altsrv: { command: 'x' } } },
    })
    const r = await f.report('claude', { env: { CLAUDE_CONFIG_DIR: alt } })
    expect(r.permissions.rules.map((x) => x.rule)).toEqual(['Alt'])
    expect(r.mcpServers.map((s) => s.name)).toEqual(['altsrv'])
    expect(r.configDirs.find((d) => d.name === 'config')).toEqual({
      name: 'config',
      path: alt,
      envVar: 'CLAUDE_CONFIG_DIR',
      exists: true,
    })
  })
})

describe('MCP servers', () => {
  test('user, project and local scopes; the highest scope is active; values redacted', async () => {
    f.write(f.home, {
      '.claude.json': {
        oauthAccount: { emailAddress: 'someone@example.com' },
        mcpServers: { shared: { command: 'user-cmd', env: { TOKEN: 'secret' } } },
        projects: {
          [f.project]: { mcpServers: { shared: { type: 'http', url: 'https://u:p@x.test/?k=v' } } },
          '/elsewhere': { mcpServers: { other: { command: 'nope' } } },
        },
      },
    })
    f.write(f.project, { '.mcp.json': { mcpServers: { shared: { command: 'project-cmd' } } } })
    const r = await f.report('claude')
    const shared = r.mcpServers.filter((s) => s.name === 'shared')
    expect(shared.map((s) => [s.scope, s.active])).toEqual([
      ['user', false],
      ['project', false],
      ['local', true],
    ])
    expect(shared[0]!.env).toEqual({ TOKEN: REDACTED })
    expect(shared[2]!.url).toBe(`https://${REDACTED}@x.test/?k=${REDACTED}`)
    expect(r.mcpServers.some((s) => s.name === 'other')).toBe(false)
    expect(JSON.stringify(r)).not.toContain('someone@example.com')
    expect(JSON.stringify(r)).not.toContain('secret')
  })

  test('includeValues keeps the values', async () => {
    f.write(f.project, { '.mcp.json': { mcpServers: { s: { command: 'c', env: { K: 'v' } } } } })
    const r = await f.report('claude', { includeValues: true })
    expect(r.mcpServers[0]!.env).toEqual({ K: 'v' })
  })

  const ARGS = [
    'mcp-remote',
    'https://u:p@x.test/sse?token=abc&mode=1',
    '--api-key',
    'k1',
    '--TOKEN=t1',
    '--secret=s1',
    'API_KEY=v1',
    'db_password=v2',
    '--key',
    'k2',
    '--verbose',
    'MODE=fast',
    'plain',
  ]

  test('args that look like secrets are redacted', async () => {
    f.write(f.home, { '.claude.json': { mcpServers: { s: { command: 'npx', args: ARGS } } } })
    const r = await f.report('claude')
    expect(r.mcpServers[0]!.args).toEqual([
      'mcp-remote',
      `https://${REDACTED}@x.test/sse?token=${REDACTED}&mode=${REDACTED}`,
      '--api-key',
      REDACTED,
      `--TOKEN=${REDACTED}`,
      `--secret=${REDACTED}`,
      `API_KEY=${REDACTED}`,
      `db_password=${REDACTED}`,
      '--key',
      REDACTED,
      '--verbose',
      'MODE=fast',
      'plain',
    ])
    const kept = await f.report('claude', { includeValues: true })
    expect(kept.mcpServers[0]!.args).toEqual(ARGS)
  })
})

describe('MCP approval and managed servers', () => {
  const statuses = (r: { mcpServers: { name: string; scope: string; active: boolean }[] }) =>
    r.mcpServers.map((s) => [s.name, s.scope, s.active])

  test('a .mcp.json server is active only once approved, and a rejection wins', async () => {
    f.write(f.project, {
      '.mcp.json': {
        mcpServers: {
          on: { command: 'a' },
          off: { command: 'b' },
          remembered: { command: 'c' },
          pending: { command: 'd' },
          both: { command: 'e' },
        },
      },
      '.claude/settings.local.json': {
        enabledMcpjsonServers: ['on', 'both'],
        disabledMcpjsonServers: ['off'],
      },
    })
    f.write(f.home, {
      '.claude.json': {
        projects: {
          [f.project]: { enabledMcpjsonServers: ['remembered'], disabledMcpjsonServers: ['both'] },
        },
      },
    })
    const r = await f.report('claude')
    expect(statuses(r)).toEqual([
      ['on', 'project', true],
      ['off', 'project', false],
      ['remembered', 'project', true],
      ['pending', 'project', false],
      ['both', 'project', false],
    ])
  })

  test('enableAllProjectMcpServers approves the rest; the highest scope that sets it wins', async () => {
    f.write(f.project, {
      '.mcp.json': { mcpServers: { a: { command: 'a' }, b: { command: 'b' } } },
      '.claude/settings.json': { enableAllProjectMcpServers: true },
    })
    f.write(f.home, { '.claude/settings.json': { disabledMcpjsonServers: ['b'] } })
    expect(statuses(await f.report('claude'))).toEqual([
      ['a', 'project', true],
      ['b', 'project', false],
    ])

    f.write(f.project, { '.claude/settings.local.json': { enableAllProjectMcpServers: false } })
    expect(statuses(await f.report('claude'))).toEqual([
      ['a', 'project', false],
      ['b', 'project', false],
    ])
  })

  test('enableAllProjectMcpServers in ~/.claude.json projects[root] is not read', async () => {
    f.write(f.project, { '.mcp.json': { mcpServers: { a: { command: 'a' } } } })
    f.write(f.home, {
      '.claude.json': { projects: { [f.project]: { enableAllProjectMcpServers: true } } },
    })
    expect(statuses(await f.report('claude'))).toEqual([['a', 'project', false]])
  })

  test('a server that is not approved does not hide a same-named user server', async () => {
    f.write(f.home, { '.claude.json': { mcpServers: { shared: { command: 'user' } } } })
    f.write(f.project, { '.mcp.json': { mcpServers: { shared: { command: 'project' } } } })
    expect(statuses(await f.report('claude'))).toEqual([
      ['shared', 'user', true],
      ['shared', 'project', false],
    ])
  })

  test('managed-mcp.json turns off every other server, plugin servers too', async () => {
    const install = join(f.home, 'plug')
    f.write(install, {
      '.claude-plugin/plugin.json': { name: 'p', mcpServers: { fromPlugin: { command: 'p' } } },
    })
    f.write(f.home, {
      '.claude.json': { mcpServers: { user: { command: 'u' } } },
      '.claude/plugins/installed_plugins.json': {
        plugins: { 'p@m': [{ scope: 'user', installPath: install }] },
      },
      '.claude/settings.json': { enabledPlugins: { 'p@m': true } },
    })
    f.write(f.project, {
      '.mcp.json': { mcpServers: { proj: { command: 'x' } } },
      '.claude/settings.json': { enableAllProjectMcpServers: true },
    })
    f.write(managedDir(), { 'managed-mcp.json': { mcpServers: { corp: { command: 'c' } } } })
    expect(statuses(await f.report('claude'))).toEqual([
      ['corp', 'managed', true],
      ['user', 'user', false],
      ['proj', 'project', false],
      ['fromPlugin', 'user', false],
    ])
  })
})

describe('plugins and marketplaces', () => {
  function seedPlugin(installPath: string): void {
    f.write(installPath, {
      '.claude-plugin/plugin.json': {
        name: 'tool',
        mcpServers: { inline: { command: 'inline-cmd' } },
        hooks: './extra-hooks.json',
      },
      'extra-hooks.json': { hooks: { Stop: [{ hooks: [{ command: 'from-manifest' }] }] } },
      'hooks/hooks.json': { hooks: { SessionStart: [{ hooks: [{ command: 'from-file' }] }] } },
      '.mcp.json': { mcpServers: { filed: { command: 'filed-cmd' } } },
      'skills/plan/SKILL.md': '---\nname: plan\ndescription: Plan it.\n---\n\nBody.\n',
      'commands/ship.md': '---\ndescription: Ship.\n---\n\nShip it.\n',
      'commands/fold/SKILL.md': '---\ndescription: Folder command.\n---\n',
      'agents/reviewer.md': '---\nname: reviewer\ndescription: Reviews.\n---\n',
    })
  }

  test('registry records that apply here, joined to enabledPlugins, with their contents', async () => {
    const userInstall = join(f.home, '.claude', 'plugins', 'cache', 'tool')
    const projectInstall = join(f.home, '.claude', 'plugins', 'cache', 'proj')
    seedPlugin(userInstall)
    f.write(f.home, {
      '.claude/plugins/installed_plugins.json': {
        version: 2,
        plugins: {
          'tool@market': [{ scope: 'user', installPath: userInstall, version: '1.0.0' }],
          'proj@market': [
            { scope: 'project', projectPath: f.project, installPath: projectInstall },
            { scope: 'project', projectPath: '/some/other/project', installPath: '/x' },
          ],
        },
      },
      '.claude/plugins/known_marketplaces.json': {
        market: {
          source: { source: 'git', url: 'https://user:tok@git.test/m.git' },
          installLocation: '/m',
        },
      },
      '.claude/settings.json': { enabledPlugins: { 'tool@market': true, 'proj@market': true } },
    })
    f.write(f.project, {
      '.claude/settings.local.json': {
        enabledPlugins: { 'proj@market': false, 'ghost@market': true },
        extraKnownMarketplaces: { extra: { source: { source: 'github', repo: 'o/r' } } },
      },
    })
    const r = await f.report('claude')

    expect(r.plugins.map((p) => [p.id, p.scope, p.installed, p.enabled])).toEqual([
      ['tool@market', 'user', true, true],
      ['proj@market', 'project', true, false],
      ['ghost@market', 'local', false, true],
    ])
    expect(r.plugins[1]!.enabledSource).toBe(join(f.project, '.claude', 'settings.local.json'))

    expect(r.marketplaces.map((m) => [m.name, m.sourceKind, m.scope])).toEqual([
      ['extra', 'github', 'local'],
      ['market', 'git', 'user'],
    ])
    expect(r.marketplaces[1]!.url).toBe(`https://${REDACTED}@git.test/m.git`)

    const origin = 'plugin:tool@market'
    expect(r.skills).toContainEqual(
      expect.objectContaining({
        name: 'plan',
        description: 'Plan it.',
        origin,
        managerOwned: true,
      }),
    )
    expect(r.commands.filter((c) => c.origin === origin).map((c) => c.name)).toEqual([
      'fold',
      'ship',
    ])
    expect(r.agents.map((a) => a.name)).toEqual(['reviewer'])
    expect(r.hooks.filter((h) => h.origin === origin).map((h) => [h.event, h.command])).toEqual([
      ['SessionStart', 'from-file'],
      ['Stop', 'from-manifest'],
    ])
    expect(r.mcpServers.filter((s) => s.origin === origin).map((s) => s.name)).toEqual([
      'filed',
      'inline',
    ])
  })

  test('a plugin installed at user and project scope is one row, read once', async () => {
    const userInstall = join(f.home, 'plug-user')
    const projectInstall = join(f.home, 'plug-project')
    seedPlugin(userInstall)
    seedPlugin(projectInstall)
    f.write(f.home, {
      '.claude/plugins/installed_plugins.json': {
        plugins: {
          'tool@market': [
            { scope: 'user', installPath: userInstall, version: '1.0.0' },
            {
              scope: 'project',
              projectPath: f.project,
              installPath: projectInstall,
              version: '2.0.0',
            },
          ],
        },
      },
      '.claude/settings.json': { enabledPlugins: { 'tool@market': true } },
    })
    const r = await f.report('claude')
    expect(r.plugins.map((p) => [p.id, p.scope, p.version, p.installPath])).toEqual([
      ['tool@market', 'project', '2.0.0', projectInstall],
    ])
    expect(r.skills.filter((s) => s.name === 'plan')).toHaveLength(1)
    expect(r.mcpServers.filter((s) => s.origin === 'plugin:tool@market')).toHaveLength(2)
  })

  describe('project-scoped records and git worktrees', () => {
    const projectRecord = (projectPath: string, installPath: string): Record<string, object> => ({
      '.claude/plugins/installed_plugins.json': {
        plugins: { 'tool@market': [{ scope: 'project', projectPath, installPath }] },
      },
      '.claude/settings.json': { enabledPlugins: { 'tool@market': true } },
    })

    test('a record for the project root applies in a plain checkout', async () => {
      f.write(f.home, projectRecord(f.project, join(f.root, 'plug')))
      const r = await f.report('claude')
      expect(r.plugins.map((p) => [p.id, p.scope, p.installed])).toEqual([
        ['tool@market', 'project', true],
      ])
    })

    test('a record for the main checkout applies in a linked worktree', async () => {
      const main = join(f.root, 'main')
      const gitdir = join(main, '.git', 'worktrees', 'wt')
      f.write(main, { '.git/worktrees/wt/commondir': '../..\n' })
      f.write(f.project, { '.git': `gitdir: ${gitdir}\n` })
      f.write(f.home, projectRecord(main, join(f.root, 'plug')))
      const r = await f.report('claude')
      expect(r.plugins.map((p) => [p.id, p.scope, p.installed])).toEqual([
        ['tool@market', 'project', true],
      ])
    })

    test('a .git file with a relative gitdir, or with no commondir, is not a linked worktree', async () => {
      const main = join(f.root, 'main')
      f.write(f.home, projectRecord(main, join(f.root, 'plug')))
      f.write(f.project, { '.git': 'gitdir: ../main/.git/worktrees/wt\n' })
      const relative = await f.report('claude')
      expect(relative.plugins.map((p) => [p.id, p.installed])).toEqual([['tool@market', false]])

      // A submodule's gitdir has no commondir file.
      f.write(main, { '.git/modules/sub/HEAD': 'ref: refs/heads/main\n' })
      f.write(f.project, { '.git': `gitdir: ${join(main, '.git', 'modules', 'sub')}\n` })
      const submodule = await f.report('claude')
      expect(submodule.plugins.map((p) => [p.id, p.installed])).toEqual([['tool@market', false]])
    })

    test('a record for an unrelated path does not apply, in a worktree or not', async () => {
      const other = join(f.root, 'other')
      f.write(f.home, projectRecord(other, join(f.root, 'plug')))
      const plain = await f.report('claude')
      expect(plain.plugins.map((p) => [p.id, p.installed])).toEqual([['tool@market', false]])

      const main = join(f.root, 'main')
      f.write(main, { '.git/worktrees/wt/commondir': '../..\n' })
      f.write(f.project, { '.git': `gitdir: ${join(main, '.git', 'worktrees', 'wt')}\n` })
      const worktree = await f.report('claude')
      expect(worktree.plugins.map((p) => [p.id, p.installed])).toEqual([['tool@market', false]])
    })
  })

  test('an enabled plugin whose install folder is gone is a warning', async () => {
    f.write(f.home, {
      '.claude/plugins/installed_plugins.json': {
        plugins: { 'gone@m': [{ scope: 'user', installPath: join(f.root, 'missing') }] },
      },
      '.claude/settings.json': { enabledPlugins: { 'gone@m': true } },
    })
    const r = await f.report('claude')
    expect(r.diagnostics.map((d) => d.message)).toContain('gone@m: install folder is missing')
  })

  test('a manifest path outside the plugin folder is ignored', async () => {
    const install = join(f.home, 'plug')
    f.write(f.home, { 'outside.json': { hooks: { Stop: [{ hooks: [{ command: 'evil' }] }] } } })
    f.write(install, { '.claude-plugin/plugin.json': { name: 'p', hooks: '../outside.json' } })
    f.write(f.home, {
      '.claude/plugins/installed_plugins.json': {
        plugins: { 'p@m': [{ scope: 'user', installPath: install }] },
      },
      '.claude/settings.json': { enabledPlugins: { 'p@m': true } },
    })
    const r = await f.report('claude')
    expect(r.hooks).toEqual([])
  })
})

describe('skills, commands, agents and instructions', () => {
  test('user and project folders; command names are file names; bodies only with readContents', async () => {
    f.write(f.home, {
      '.claude/skills/alpha/SKILL.md': '---\ndescription: A.\n---\n\n# Alpha\n',
      '.claude/agents/helper.md': '---\nname: helper-agent\n---\n',
      '.claude/CLAUDE.md': '# user\n',
    })
    f.write(f.project, {
      '.claude/commands/deploy/web.md': '---\nname: ignored\ndescription: Web.\n---\n',
      '.claude/skills/not-a-skill.md': 'no folder\n',
      'CLAUDE.md': '# project\n',
      'CLAUDE.local.md': '# local\n',
      '.claude/rules/style.md': '# style\n',
    })
    const r = await f.report('claude')
    expect(r.skills.map((s) => [s.name, s.scope, s.body])).toEqual([['alpha', 'user', null]])
    expect(r.commands.map((c) => [c.name, c.description, c.scope])).toEqual([
      ['web', 'Web.', 'project'],
    ])
    expect(r.agents.map((a) => a.name)).toEqual(['helper-agent'])
    expect(r.instructions).toEqual([
      { path: join(f.home, '.claude', 'CLAUDE.md'), scope: 'user' },
      { path: join(f.project, 'CLAUDE.md'), scope: 'project' },
      { path: join(f.project, '.claude', 'rules', 'style.md'), scope: 'project' },
      { path: join(f.project, 'CLAUDE.local.md'), scope: 'local' },
    ])

    const withBody = await f.report('claude', { readContents: true })
    expect(withBody.skills[0]!.body).toBe('# Alpha\n')
  })
})

describe('sign-in evidence', () => {
  test('the credentials file wins, then the oauthAccount key, then a variable', async () => {
    f.write(f.home, { '.claude.json': { oauthAccount: { x: 1 } } })
    let r = await f.report('claude', { env: { ANTHROPIC_API_KEY: 'k' } })
    expect(r.auth).toEqual({
      signedIn: true,
      evidence: `${join(f.home, '.claude.json')}#oauthAccount`,
      providers: null,
    })

    f.write(f.home, { '.claude/.credentials.json': '{}' })
    r = await f.report('claude')
    expect(r.auth.evidence).toBe(join(f.home, '.claude', '.credentials.json'))
  })

  test('a variable alone; nothing is unknown', async () => {
    expect(
      (await f.report('claude', { env: { CLAUDE_CODE_OAUTH_TOKEN: 't' } })).auth.evidence,
    ).toBe('CLAUDE_CODE_OAUTH_TOKEN')
    expect((await f.report('claude')).auth).toEqual({
      signedIn: 'unknown',
      evidence: null,
      providers: null,
    })
  })
})

describe('folder walks', () => {
  test('a symbolic link back to its folder lists each rules file once', async () => {
    f.write(f.project, { '.claude/rules/a.md': '# a' })
    symlinkSync('.', join(f.project, '.claude', 'rules', 'self'))
    const r = await f.report('claude', { mode: 'project' })
    expect(r.instructions.map((i) => basename(i.path))).toEqual(['a.md'])
  })

  test('two links that lead to each other return promptly, each file once', async () => {
    f.write(f.project, { '.claude/rules/a.md': '# a', '.claude/commands/c.md': '# c' })
    for (const d of ['rules', 'commands']) {
      symlinkSync('.', join(f.project, '.claude', d, 'self'))
      symlinkSync('.', join(f.project, '.claude', d, 'also'))
      mkdirSync(join(f.project, '.claude', d, 'x'))
      symlinkSync('..', join(f.project, '.claude', d, 'x', 'up'))
    }
    const r = await f.report('claude', { mode: 'project' })
    expect(r.instructions.map((i) => basename(i.path))).toEqual(['a.md'])
    expect(r.commands.map((c) => c.name)).toEqual(['c'])
  })

  test('an installed plugin that no settings file names has enabled null', async () => {
    f.write(f.home, {
      '.claude/plugins/installed_plugins.json': {
        plugins: { 'p@m': [{ scope: 'user', installPath: join(f.root, 'plug') }] },
      },
    })
    const r = await f.report('claude')
    expect(r.plugins.map((p) => [p.id, p.installed, p.enabled])).toEqual([['p@m', true, null]])
  })
})
