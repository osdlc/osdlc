import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
import { dockerCompose } from '../src/plugins/runners/index.ts'
import { readCompose } from '../src/plugins/runners/docker-compose.ts'
import {
  collect,
  detectAndCollect,
  fakeRunners,
  fakeWhich,
  fixtureRoot,
  removeRoot,
} from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string>): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

/**
 * Fixture roots are not repositories, so discovery is pinned to the walk. Only
 * the docker-compose tool is registered.
 */
function opts(extra: Record<string, unknown> = {}) {
  return { discovery: 'walk' as const, tools: [dockerCompose], ...extra }
}

function byName(list: Task[], name: string): Task | undefined {
  return list.find((t) => t.path[t.path.length - 1] === name)
}

function report(catalog: Awaited<ReturnType<typeof collect>>) {
  return catalog.reports.find((r) => r.runner === 'docker-compose')
}

function messages(catalog: Awaited<ReturnType<typeof collect>>): string {
  return (report(catalog)?.diagnostics ?? []).map((d) => d.message).join('\n')
}

const WEB_API = [
  '# a realistic two-tier app',
  'services:',
  '  web:',
  '    image: nginx:alpine',
  '    ports:',
  '      - "8080:80"',
  '    depends_on:',
  '      - api',
  '  api:',
  '    build: ./api',
  '    environment:',
  '      NODE_ENV: development',
  '  db:',
  '    image: postgres:16',
  '',
].join('\n')

/** The files the profile cites for docker-compose, across packages. */
async function evidenceOf(dir: string): Promise<string[]> {
  const { profile } = await detectAndCollect(dir, opts())
  return profile.packages
    .flatMap((p) => p.tools.filter((t) => t.tool === 'docker-compose'))
    .flatMap((t) => t.evidence.map((e) => e.source))
    .sort()
}

describe('docker-compose runner', () => {
  test('absent on an empty root', async () => {
    const dir = await root({ 'README.md': 'hi' })
    const catalog = await collect(dir, opts())
    expect(report(catalog)).toBeUndefined()
  })

  test('a realistic compose.yaml yields one task per service', async () => {
    const dir = await root({ 'compose.yaml': WEB_API })
    const catalog = await collect(dir, opts())
    expect(report(catalog)?.status).toBe('ok')

    const list = tasks(catalog)
    expect(list.map((t) => t.path[t.path.length - 1]).sort()).toEqual(['api', 'db', 'web'])

    const web = byName(list, 'web')
    expect(web?.argv).toEqual(['docker', 'compose', '-f', 'compose.yaml', 'up', 'web'])
    expect(web?.display).toBe('docker compose -f compose.yaml up web')
    expect(web?.cwd).toBe('.')
    expect(web?.source).toBe('compose.yaml')
    expect(web?.origin).toBe('declared')
    expect(web?.id).toBe('docker-compose:compose.yaml:web')
    expect(web?.path).toEqual(['docker-compose', '.', 'web'])
    expect(web?.parameters).toEqual([])
    expect(web?.tags).toEqual(['docker-compose', '.'])

    // `image:` and a scalar `build:` are both cheap to read. A mapping-valued
    // `build:` is skipped rather than guessed at.
    expect(web?.detail).toBe('image: nginx:alpine')
    expect(byName(list, 'api')?.detail).toBe('build: ./api')
    expect(byName(list, 'db')?.detail).toBe('image: postgres:16')

    // The id is a pure function of runner, source and service name, so a
    // re-collect over the same tree hands a UI back the same identities.
    const again = tasks(await collect(dir, opts()))
    expect(again.map((t) => t.id)).toEqual(list.map((t) => t.id))
  })

  test('every emitted task is executes: container and persistent-by-inference', async () => {
    const dir = await root({
      'compose.yaml': WEB_API,
      'svc/docker-compose.yml': 'services:\n  worker:\n    image: alpine\n',
    })
    const list = tasks(await collect(dir, opts()))
    expect(list.length).toBe(4)
    for (const t of list) {
      // Not "local": what the command starts runs in a container. The
      // detection posture (parse) is a different axis and says nothing here.
      expect(t.executes).toBe('container')
      // `value: true` is the right default. The name heuristic would call
      // `worker` and `db` non-persistent, and both are servers.
      // `declared: false` because Compose never states persistence. The
      // provider infers it from `up`, and the inference is wrong for a
      // one-shot service (see the test below).
      expect(t.persistent).toEqual({ value: true, declared: false })
    }
  })

  test('a one-shot service is still persistent: true, but never declared: true', async () => {
    // The counterexample the flag exists for. `docker compose up oneshot` on
    // this file prints `hello` and exits 0 immediately (Docker 29.6.2), so
    // `value: true` is wrong here. The provider keeps the default because it
    // is right for most services and `command:` alone cannot tell the cases
    // apart. It marks the value `declared: false`, so a consumer that only
    // trusts what a runner actually said can filter it out.
    const dir = await root({
      'compose.yaml': [
        'services:',
        '  oneshot:',
        '    image: alpine',
        '    command: echo hello',
        '',
      ].join('\n'),
    })
    const oneshot = byName(tasks(await collect(dir, opts())), 'oneshot')
    expect(oneshot?.persistent).toEqual({ value: true, declared: false })
  })

  test("a nested compose file is addressed with -f, and cwd stays '.'", async () => {
    const dir = await root({ 'sub/dir/compose.yaml': 'services:\n  worker:\n    image: alpine\n' })
    const list = tasks(await collect(dir, opts()))
    const worker = byName(list, 'worker')
    expect(worker?.argv).toEqual([
      'docker',
      'compose',
      '-f',
      'sub/dir/compose.yaml',
      'up',
      'worker',
    ])
    expect(worker?.display).toBe('docker compose -f sub/dir/compose.yaml up worker')
    expect(worker?.cwd).toBe('.')
    expect(worker?.path).toEqual(['docker-compose', 'sub/dir', 'worker'])
    expect(worker?.tags).toEqual(['docker-compose', 'sub/dir'])
  })

  test('compose files in different directories are independent projects', async () => {
    const dir = await root({
      'compose.yaml': 'services:\n  web:\n    image: nginx\n',
      'tools/compose.yaml': 'services:\n  web:\n    image: alpine\n',
    })
    const catalog = await collect(dir, opts())
    const list = tasks(catalog)

    expect(list.length).toBe(2)
    expect(list.map((t) => t.display).sort()).toEqual([
      'docker compose -f compose.yaml up web',
      'docker compose -f tools/compose.yaml up web',
    ])
    // The same service name in two files is two distinct identities.
    expect(new Set(list.map((t) => t.id)).size).toBe(2)
    // Both files are evidence; neither shadows the other.
    expect(await evidenceOf(dir)).toEqual(['compose.yaml', 'tools/compose.yaml'])
    expect(report(catalog)?.diagnostics).toEqual([])
  })

  test('a hostile service name survives into argv verbatim, as one element', async () => {
    // The invariant is not that service names are free of shell
    // metacharacters. A Compose key can hold any of them, as this fixture does.
    // The invariant is that `argv` is an array spawned directly and never
    // joined into a shell command line. A name carrying `$( )`, `;` or a space
    // arrives at `docker` as a single element: nothing is split, escaped or
    // expanded. If argv were built by string concatenation, this test would fail.
    const dir = await root({
      'compose.yaml': [
        'services:',
        '  $(whoami):',
        '    image: a',
        '  "a;b":',
        '    image: b',
        '  "x y":',
        '    image: c',
        '',
      ].join('\n'),
    })
    const list = tasks(await collect(dir, opts()))
    const names = ['$(whoami)', 'a;b', 'x y']
    expect(list.map((t) => t.path[t.path.length - 1]).sort()).toEqual([...names].sort())

    for (const name of names) {
      const task = byName(list, name)
      // Exactly six elements: the name is the whole of the last one, not two
      // elements and not a quoted or backslash-escaped rendering of itself.
      expect(task?.argv).toEqual(['docker', 'compose', '-f', 'compose.yaml', 'up', name])
      expect(task?.argv.filter((a) => a === name).length).toBe(1)
    }

    // `display` is for reading and may be ambiguous, since it is never
    // executed. It is not shell-safe: pasted, `docker compose -f compose.yaml
    // up x y` would pass two arguments. That is why `argv` is the executed form.
    expect(byName(list, 'x y')?.display).toBe('docker compose -f compose.yaml up x y')
  })

  test('the provider never spawns', async () => {
    const dir = await root({ 'compose.yaml': WEB_API })
    const { make, calls } = fakeRunners([])
    // Even with execution permitted and `docker` on the PATH there is nothing
    // this provider wants a subprocess for: Compose's own listing resolves
    // `include:`/`extends:` and hides profiled services, so it would report
    // fewer services than the file declares.
    const catalog = await collect(
      dir,
      opts({
        makeRunner: make,
        which: fakeWhich({ docker: '/usr/local/bin/docker' }),
        allowExec: true,
      }),
    )
    expect(calls).toEqual([])
    expect(tasks(catalog).length).toBe(3)
  })

  test('the report carries the declared binary, filled by collect', async () => {
    const dir = await root({ 'compose.yaml': WEB_API })
    const catalog = await collect(
      dir,
      opts({ which: fakeWhich({ docker: '/usr/local/bin/docker' }) }),
    )
    expect(report(catalog)?.tool?.binary).toBe('docker')
    expect(report(catalog)?.tool?.found).toBe(true)
  })
})

describe('docker-compose filename precedence', () => {
  const FOUR: Record<string, string> = {
    'compose.yaml': 'services:\n  from_compose_yaml:\n    image: alpine\n',
    'compose.yml': 'services:\n  from_compose_yml:\n    image: alpine\n',
    'docker-compose.yml': 'services:\n  from_dc_yml:\n    image: alpine\n',
    'docker-compose.yaml': 'services:\n  from_dc_yaml:\n    image: alpine\n',
  }

  test('all four in one directory: only compose.yaml is read', async () => {
    const dir = await root(FOUR)
    const catalog = await collect(dir, opts())
    const list = tasks(catalog)

    expect(list.length).toBe(1)
    expect(list[0]?.argv).toEqual([
      'docker',
      'compose',
      '-f',
      'compose.yaml',
      'up',
      'from_compose_yaml',
    ])
    expect(await evidenceOf(dir)).toEqual([
      'compose.yaml',
      'compose.yml',
      'docker-compose.yaml',
      'docker-compose.yml',
    ])

    const shadowed = report(catalog)?.diagnostics.find((d) =>
      /multiple Compose config files/.test(d.message),
    )
    expect(shadowed?.severity).toBe('warning')
    expect(shadowed?.source).toBe('compose.yaml')
    // Named in precedence order, so the message doubles as documentation of it.
    expect(shadowed?.message).toMatch(/compose\.yml, docker-compose\.yml, docker-compose\.yaml/)
  })

  test('compose.yml beats both docker-compose names', async () => {
    const { 'compose.yaml': _drop, ...rest } = FOUR
    const dir = await root(rest)
    const list = tasks(await collect(dir, opts()))
    expect(list.length).toBe(1)
    expect(list[0]?.source).toBe('compose.yml')
  })

  test('docker-compose.yml beats docker-compose.yaml — the empirically surprising case', async () => {
    // The `compose` prefix prefers `.yaml`. The `docker-compose` prefix
    // prefers `.yml`. That reversal is real, not a typo. It was verified
    // against Docker 29.6.2 by deleting the winning file one at a time and
    // re-running `docker compose config --services`.
    const dir = await root({
      'docker-compose.yml': FOUR['docker-compose.yml'] ?? '',
      'docker-compose.yaml': FOUR['docker-compose.yaml'] ?? '',
    })
    const catalog = await collect(dir, opts())
    const list = tasks(catalog)

    expect(list.length).toBe(1)
    expect(list[0]?.source).toBe('docker-compose.yml')
    expect(byName(list, 'from_dc_yml')).toBeDefined()
    expect(byName(list, 'from_dc_yaml')).toBeUndefined()

    const shadowed = report(catalog)?.diagnostics.find((d) =>
      /multiple Compose config files/.test(d.message),
    )
    expect(shadowed?.message).toMatch(/docker-compose\.yaml/)
    expect(shadowed?.source).toBe('docker-compose.yml')
  })

  test('precedence is applied per directory, not across the tree', async () => {
    const dir = await root({
      'compose.yaml': 'services:\n  root_svc:\n    image: alpine\n',
      'sub/docker-compose.yaml': 'services:\n  sub_svc:\n    image: alpine\n',
    })
    const catalog = await collect(dir, opts())
    const list = tasks(catalog)
    // The root's compose.yaml does not shadow a lower-precedence name in
    // another directory: those are separate Compose projects.
    expect(list.map((t) => t.source).sort()).toEqual(['compose.yaml', 'sub/docker-compose.yaml'])
    expect(report(catalog)?.diagnostics).toEqual([])
  })

  test('a lone low-precedence filename is read normally', async () => {
    const dir = await root({ 'docker-compose.yaml': FOUR['docker-compose.yaml'] ?? '' })
    const catalog = await collect(dir, opts())
    expect(tasks(catalog).length).toBe(1)
    expect(report(catalog)?.diagnostics).toEqual([])
  })
})

describe('docker-compose diagnostics for unreadable YAML constructs', () => {
  test('an anchor/alias produces the honest diagnostic', async () => {
    const dir = await root({
      'compose.yaml': [
        'services:',
        '  web: &base',
        '    image: nginx',
        '  api:',
        '    image: *base',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    expect(messages(catalog)).toMatch(/anchors and aliases/)
    expect(report(catalog)?.diagnostics.every((d) => d.source === 'compose.yaml')).toBe(true)
  })

  test('a merge key produces the honest diagnostic', async () => {
    const dir = await root({
      'compose.yaml': ['services:', '  web:', '    <<: *defaults', '    image: nginx', ''].join(
        '\n',
      ),
    })
    const catalog = await collect(dir, opts())
    expect(messages(catalog)).toMatch(/merge keys/)
  })

  test('a multi-document file reads only the first document and says so', async () => {
    const dir = await root({
      'compose.yaml': [
        'services:',
        '  web:',
        '    image: nginx',
        '---',
        'services:',
        '  never_read:',
        '    image: alpine',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    expect(messages(catalog)).toMatch(/multi-document YAML/)
    expect(byName(tasks(catalog), 'web')).toBeDefined()
    expect(byName(tasks(catalog), 'never_read')).toBeUndefined()
  })

  test('a `...` end marker ends the first document like `---` does', async () => {
    // `...` closes a document without opening another, so anything after it
    // belongs to a second document. Read as ordinary content it would put a
    // later document's services under this file's name.
    const dir = await root({
      'compose.yaml': [
        'services:',
        '  web:',
        '    image: nginx',
        '...',
        'services:',
        '  never_read:',
        '    image: alpine',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    expect(messages(catalog)).toMatch(/multi-document YAML/)
    expect(byName(tasks(catalog), 'web')).toBeDefined()
    expect(byName(tasks(catalog), 'never_read')).toBeUndefined()
  })

  test('a comment header before `---` opens the file, it does not end it', async () => {
    // That `---` is the directives-end marker of the first document, and YAML
    // allows comments before it. Deciding opener or separator by line index
    // would drop the whole file and blame a second document that is not there.
    const dir = await root({
      'compose.yaml': [
        '# my compose file',
        '---',
        'services:',
        '  web:',
        '    image: nginx',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    expect(report(catalog)?.status).toBe('ok')
    expect(byName(tasks(catalog), 'web')).toBeDefined()
    expect(report(catalog)?.diagnostics).toEqual([])
  })

  test('a trailing `---` with nothing after it is not a second document', async () => {
    // The file declares one document and the reader read all of it. Warning
    // that services are missing would assert the opposite of what happened.
    const dir = await root({
      'compose.yaml': ['services:', '  web:', '    image: nginx', '---', ''].join('\n'),
    })
    const catalog = await collect(dir, opts())
    expect(byName(tasks(catalog), 'web')).toBeDefined()
    expect(report(catalog)?.diagnostics).toEqual([])
  })

  test('a flow-style services: mapping reads nothing and says so', async () => {
    const dir = await root({ 'compose.yaml': 'services: { web: { image: nginx } }\n' })
    const catalog = await collect(dir, opts())
    expect(report(catalog)?.status).toBe('absent')
    expect(tasks(catalog)).toEqual([])
    expect(messages(catalog)).toMatch(/flow-style `services:` mapping/)
  })

  test("include: produces the honest diagnostic and this file's services still parse", async () => {
    const dir = await root({
      'compose.yaml': [
        'include:',
        '  - path: ./common/compose.yaml',
        'services:',
        '  web:',
        '    image: nginx',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    expect(messages(catalog)).toMatch(/`include:` pulling in other Compose files/)
    expect(byName(tasks(catalog), 'web')).toBeDefined()
  })

  test('extends: produces the honest diagnostic and the service is still listed', async () => {
    const dir = await root({
      'compose.yaml': [
        'services:',
        '  web:',
        '    extends:',
        '      file: common.yaml',
        '      service: base',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    expect(messages(catalog)).toMatch(/`extends:` pulling a service definition/)
    // The service is real and runnable even though its inherited fields were
    // not read, so it is emitted rather than dropped.
    expect(byName(tasks(catalog), 'web')).toBeDefined()
  })

  test('a profiled service is emitted, with a diagnostic about bare `up`', async () => {
    const dir = await root({
      'compose.yaml': [
        'services:',
        '  web:',
        '    image: nginx',
        '  debugger:',
        '    image: alpine',
        '    profiles:',
        '      - debug',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    const list = tasks(catalog)

    // Naming a profiled service explicitly on `up` starts it. Compose
    // auto-enables the profile. Verified against Docker 29.6.2 with
    // `docker compose -f compose.yaml --dry-run up debugger`, which created
    // the container while `config --services` listed only `web`. So the task
    // is correct and is emitted like any other.
    const debugger_ = byName(list, 'debugger')
    expect(debugger_?.argv).toEqual(['docker', 'compose', '-f', 'compose.yaml', 'up', 'debugger'])

    const profiles = report(catalog)?.diagnostics.find((d) => /profiles:/.test(d.message))
    expect(profiles?.severity).toBe('warning')
    expect(profiles?.message).toMatch(/debugger/)
    expect(profiles?.message).toMatch(/bare `docker compose up` does not start it/)
    // Only the profiled service is named, not `web`.
    expect(profiles?.message).not.toMatch(/web/)
  })

  test('an indented `---` inside a block scalar is content, not a separator', async () => {
    // `docker compose config --services` on this file reports `db` and `web`
    // (Docker 29.6.2). Read as a separator, the `---` would truncate the file
    // at `echo two`. `db` would vanish with no sign, and the multi-document
    // warning would claim a second document that does not exist.
    const dir = await root({
      'compose.yaml': [
        'services:',
        '  web:',
        '    image: alpine',
        '    command: |',
        '      echo one',
        '      ---',
        '      echo two',
        '  db:',
        '    image: postgres',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    expect(
      tasks(catalog)
        .map((t) => t.path[t.path.length - 1])
        .sort(),
    ).toEqual(['db', 'web'])
    expect(report(catalog)?.diagnostics).toEqual([])
  })

  test("a block scalar's body is literal text: no anchor or merge-key warning from it", async () => {
    const dir = await root({
      'compose.yaml': [
        'services:',
        '  web:',
        '    image: alpine',
        '    command: |',
        '      echo &notanchor',
        '      <<: not a merge key',
        '  db:',
        '    image: postgres',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    expect(
      tasks(catalog)
        .map((t) => t.path[t.path.length - 1])
        .sort(),
    ).toEqual(['db', 'web'])
    expect(report(catalog)?.diagnostics).toEqual([])
  })

  test('a top-level `---` after a block scalar is still a separator', async () => {
    // The block-scalar exception must not swallow the real case: this `---`
    // is at indent 0 and the `x: |` body (indent 2) has ended by the time it
    // is reached.
    const dir = await root({
      'compose.yaml': [
        'x: |',
        '  ---',
        '---',
        'services:',
        '  never_read:',
        '    image: alpine',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    expect(messages(catalog)).toMatch(/multi-document YAML/)
    expect(tasks(catalog)).toEqual([])
  })

  test('a leading UTF-8 BOM does not swallow the file', async () => {
    // Docker accepts a BOM'd compose file and reports `web`. Left in place, the
    // BOM binds to the `services` key, so no service matches and no diagnostic
    // is raised. The report would be `absent` with an aspect and empty
    // `diagnostics`: the silent under-reporting the module docblock promises
    // never happens.
    const dir = await root({ 'compose.yaml': '\uFEFFservices:\n  web:\n    image: alpine\n' })
    const catalog = await collect(dir, opts())
    expect(report(catalog)?.status).toBe('ok')
    const web = byName(tasks(catalog), 'web')
    expect(web?.argv).toEqual(['docker', 'compose', '-f', 'compose.yaml', 'up', 'web'])
    // The BOM is gone from the name, not merely tolerated somewhere in it.
    expect(web?.path[web.path.length - 1]).toBe('web')
    expect(web?.detail).toBe('image: alpine')
    expect(report(catalog)?.diagnostics).toEqual([])
  })

  test('a glob in a command value is not mistaken for a YAML alias', async () => {
    // `*tmp` sits inside a plain scalar, which runs to end of line, so it
    // cannot be an alias. YAML aliases are whole nodes. The file contains no
    // anchor and no alias, and a warning saying otherwise is a false alarm on
    // a file that parsed perfectly.
    const dir = await root({
      'compose.yaml': [
        'services:',
        '  web:',
        '    image: alpine',
        '    command: rm -rf *tmp',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    expect(byName(tasks(catalog), 'web')).toBeDefined()
    expect(report(catalog)?.diagnostics).toEqual([])
  })

  test('aliases in value, list-item and flow positions are still caught', async () => {
    // The other side of the test above: the stricter check must not miss a
    // real alias. Each of these is an alias in a position where one is legal.
    for (const field of ['image: *base', 'ports:\n      - *portref', 'x-extra: [*a, *b]']) {
      const { warnings } = readCompose(`services:\n  web:\n    ${field}\n`)
      expect(warnings.join('\n')).toMatch(/anchors and aliases/)
    }
    // And an anchor declared on a service key.
    expect(readCompose('services:\n  web: &base\n    image: nginx\n').warnings.join('\n')).toMatch(
      /anchors and aliases/,
    )
  })

  test('a clean file raises no diagnostics at all', async () => {
    const dir = await root({ 'compose.yaml': WEB_API })
    const catalog = await collect(dir, opts())
    expect(report(catalog)?.diagnostics).toEqual([])
  })
})

describe('readCompose', () => {
  test('a file with no services: key yields nothing and no warnings', () => {
    const { services, warnings } = readCompose('name: myproject\nvolumes:\n  data:\n')
    expect(services.size).toBe(0)
    expect(warnings).toEqual([])
  })

  test('a file with no services: key is absent but still counted as evidence', async () => {
    const dir = await root({ 'compose.yaml': 'name: myproject\nvolumes:\n  data:\n' })
    const catalog = await collect(dir, opts())
    expect(report(catalog)?.status).toBe('absent')
    expect(report(catalog)?.tasks).toEqual([])
    // The file is there, and a caller asking "is this a Compose project"
    // should be told yes even though it declares no services.
    expect(await evidenceOf(dir)).toEqual(['compose.yaml'])
  })

  test('comments and quoted keys parse correctly', async () => {
    const dir = await root({
      'compose.yaml': [
        '# leading comment',
        'services: # trailing comment on the services key',
        "  'web':",
        "    image: 'nginx:alpine' # the image",
        '  "api":',
        '    image: "node:22"',
        "    command: sh -c 'echo # not a comment inside quotes'",
        '',
      ].join('\n'),
    })
    const list = tasks(await collect(dir, opts()))
    expect(list.map((t) => t.path[t.path.length - 1]).sort()).toEqual(['api', 'web'])
    expect(byName(list, 'web')?.detail).toBe('image: nginx:alpine')
    expect(byName(list, 'api')?.detail).toBe('image: node:22')
  })

  test('does not descend into nested fields', () => {
    const { services } = readCompose(
      [
        'services:',
        '  web:',
        '    image: nginx',
        '    build:',
        '      context: .',
        '    labels:',
        '      image: not-the-image',
        '',
      ].join('\n'),
    )
    expect(services.size).toBe(1)
    expect(services.get('web')?.detail).toBe('image: nginx')
  })

  test('a service with neither image nor a scalar build has no detail', () => {
    const { services } = readCompose(
      ['services:', '  web:', '    build:', '      context: ./web', ''].join('\n'),
    )
    expect(services.get('web')?.detail).toBeUndefined()
  })

  test('top-level keys after services: end the mapping', () => {
    const { services } = readCompose(
      [
        'services:',
        '  web:',
        '    image: nginx',
        'volumes:',
        '  data:',
        'networks:',
        '  front:',
        '',
      ].join('\n'),
    )
    expect([...services.keys()]).toEqual(['web'])
  })
})
