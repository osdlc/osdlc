---
title: Writing a plugin
description: Write a host-cleaner plugin with the plugin entry, test it with the contract suite, and publish it.
---

A plugin is one package that exports one `definePlugin` value. It proposes
candidates (things that could be deleted), may object to any candidate, and
deletes its own. The core decides what runs and checks everything again before
it runs. The [README](../../README.md) describes the phases and the rules; this
guide is how to write, test and publish a plugin of your own.
[`examples/podman-plugin`](../../examples/podman-plugin/README.md) is a whole
plugin package written this way: ref candidates, `costDescription: 'lost'`,
and tests on a fake runner.

A plugin uses two entries of `@osdlc/host-cleaner`, and no other:

| Entry | Holds |
| --- | --- |
| `@osdlc/host-cleaner/plugin` | `definePlugin`, `PLUGIN_API`, the contract's types, the kit (`pluginKit`, `idleHoursSetting` and its types), `containedIn`, `FatalRun`, and `z`. |
| `@osdlc/host-cleaner/testing` | `fakeContext`, `fakeRunner`, `tempHome` and `contractSuite`, for the plugin's own tests. |

A plugin's tests may also import `survey`, `plan` and `clean` from the main
entry, `@osdlc/host-cleaner`, to run it through the core, as the example's do.
The plugin itself uses the plugin entry alone.

## The package

```json
{
  "name": "host-cleaner-scratch",
  "type": "module",
  "exports": "./dist/index.js",
  "peerDependencies": { "@osdlc/host-cleaner": "^0.2.0" },
  "devDependencies": { "@osdlc/host-cleaner": "^0.2.0" }
}
```

- ESM only, like host-cleaner.
- `@osdlc/host-cleaner` is a peer dependency, so the plugin runs on the copy
  the command line has, with the same kit and the same checks.
- Do not depend on zod yourself. Use the `z` the plugin entry re-exports, so
  your settings schema is built with the zod the core validates it with.

## Writing it

This plugin cleans the folders under `~/.scratch` that have sat idle:

```ts
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import {
  DEFAULT_IDLE_HOURS,
  PLUGIN_API,
  definePlugin,
  idleHoursSetting,
  z,
  type Candidate,
} from '@osdlc/host-cleaner/plugin'

export default definePlugin({
  name: 'scratch',
  api: PLUGIN_API,
  settings: z.object({ dir: z.string().optional(), idleHours: idleHoursSetting }),
  create({ settings, env, kit }) {
    const root = settings.dir ?? join(env.HOME ?? '', '.scratch')
    const idleHours = settings.idleHours ?? DEFAULT_IDLE_HOURS
    return {
      name: 'scratch',
      detect: () => existsSync(root),
      roots: () => [root],
      discover() {
        return readdirSync(root, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .flatMap((e): Candidate[] => {
            const path = join(root, e.name)
            const idle = kit.idle(path)
            if (idle.unmeasured) {
              return [
                kit.candidate({
                  kind: 'scratch',
                  path,
                  why: 'too big to measure',
                  unmeasured: true,
                }),
              ]
            }
            if (idle.hours !== null && idle.hours < idleHours) return []
            return [
              kit.candidate({
                kind: 'scratch',
                path,
                why: `idle ${Math.floor(idle.hours ?? 0)} hours`,
                costDescription: 'rebuild',
                evidence: { newestMs: idle.newestMs },
              }),
            ]
          })
      },
      delete(c, ctx) {
        if (c.path === undefined) throw new Error(`scratch: ${c.id} is not a folder`)
        return kit.remove(c.path, ctx)
      },
    }
  },
})
```

What it relies on:

- **`definePlugin`** ties the plugin `create` returns to the kit it was given.
  The core binds that kit, each run, to the plugin's `roots`, the run's targets
  and their linked worktrees. So `kit.remove(path)` needs no roots, and a kit
  no run has bound removes nothing.
- **`api`** is `PLUGIN_API`, the plugin API this host-cleaner supports. It
  changes only with a major release.
- **`settings`** is the schema of the plugin's entry in the config's
  `plugins`. The core adds `enabled` and makes it strict, so an unknown key is
  a config error. `create` gets the entry validated, with its defaults filled
  in.
- **`idleHoursSetting`**, declared under the key `idleHours`, inherits the
  config's top-level `idleHours` when the plugin's own entry sets none.
- **`env`** is the command line's environment.
- **`kit.candidate`** fills in the id (`<kind>:<path>` or `<kind>:<ref>`) and
  the owner.

The rules every plugin keeps:

- **Paths and refs.** A candidate is a path, a folder its owner deletes, or a
  ref, a thing deleted by name with no folder of its own. A path must sit
  strictly inside the plugin's `roots`, a target or a linked worktree of one;
  the core refuses it otherwise (`outside-roots`) and checks again right
  before `delete`.
- **Delete with `kit.remove`.** Never remove a folder yourself. `kit.remove`
  checks the path is still inside the bounds by its real path, makes
  read-only files writable, removes the folder and returns the receipt
  sentence. `delete` acts on `c.path` alone, or on `c.ref` alone for a ref.
- **Plain JSON.** Candidates and objections go into a plan file, so they hold
  only what JSON keeps.
- **Evidence.** Put in `evidence` what your objections and your judgement
  rest on. The core surveys again before it deletes, and a candidate whose
  evidence moved is dropped as `changed`.
- **What deleting costs.** `costDescription` is `re-download`, `rebuild` or
  `lost`. A `lost` candidate is held for review and needs
  `--allow discard-user-data`.
- **Time.** Each hook has a time limit. Pass `ctx.signal` to whatever it waits
  on, and to `kit.run`. Throw `FatalRun` to stop the whole run, not only one
  candidate.

The [README](../../README.md#the-plugin-kit) lists every kit helper and the hooks
in the order the core calls them.

## Testing it

Build the plugin as the core does, with a kit of its own, and run the contract
suite on a fixture where it finds something:

```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { pluginKit } from '@osdlc/host-cleaner/plugin'
import { contractSuite, tempHome } from '@osdlc/host-cleaner/testing'
import { expect, test } from 'vitest'

import scratch from '../src/index.js'

test('scratch keeps the contract', async () => {
  const home = tempHome()
  try {
    mkdirSync(join(home.home, '.scratch', 'build-1'), { recursive: true })
    writeFileSync(join(home.home, '.scratch', 'build-1', 'out.bin'), 'x')
    const plugin = scratch.create({
      settings: scratch.settings.parse({ idleHours: 0 }),
      env: home.env,
      kit: pluginKit(scratch.name, { env: home.env }),
    })
    expect(await contractSuite(plugin, { cwd: home.home })).toEqual([])
  } finally {
    home.cleanup()
  }
})
```

- `contractSuite` surveys the plugin twice. It checks that the survey warns of
  nothing, that every path is inside the bounds, that ids and evidence are the
  same both times, that everything survives JSON, and that `delete` refuses a
  folder moved outside the bounds. It returns one line per broken rule.
- A plugin's `delete` that calls `kit.remove`, called on its own before any
  survey, throws: the kit is not bound to a run. Test deleting through
  `contractSuite`.
- If your `delete` checks things of its own before `kit.remove`, the suite's
  outside folder may be refused there and never reach `kit.remove`. Test that
  refusal too.
- For a plugin that runs programs, `fakeRunner({ program: answers })` gives
  the kit fake programs: spread it into `pluginKit`'s options, and read
  `calls` to see what ran.
- `fakeContext(over)` is a hook's context, for calling one hook directly.

## Publishing it

- Give it a `name` no shipped plugin has (`git`, `cargo`, `node` and `orca`
  are taken).
- Build it to JavaScript with its type declarations, and publish it as an
  ESM package with `@osdlc/host-cleaner` as a peer dependency.
- Install it where host-cleaner looks: a `node_modules` folder host-cleaner
  itself resolves from, or the global npm prefix's. Then name it in the config
  under its plugin `name`:
  `"plugins": { "scratch": { "package": "host-cleaner-scratch" } }`. The
  loader checks that the default export is a `definePlugin` value with that
  `name` and `api: PLUGIN_API`, and that `create` returns a plugin of the same
  name built on the kit it was given. A plugin built with a second copy of
  `@osdlc/host-cleaner` fails that last check, so the package must use the copy
  the command line runs.
