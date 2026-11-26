# An example plugin: Podman volumes

A host-cleaner plugin in a package of its own (tier 3). It proposes the Podman
volumes no container uses, running or stopped, and deletes one with
`podman volume rm`. [Writing a plugin](../../docs/guide/writing-a-plugin.md) is
the guide it follows. It is not published.

| File | Holds |
| --- | --- |
| [`package.json`](./package.json) | The package as it would be published: ESM, built to `dist/` by `npm run build` and tested by `npm test`, with `@osdlc/host-cleaner` `^0.4.0`, which under 0.x is 0.4 only, as a peer dependency. |
| [`tsconfig.json`](./tsconfig.json) | The build: `src/` to `dist/`, with the declarations the `types` export names. |
| [`src/index.ts`](./src/index.ts) | The plugin, one `definePlugin` value. |
| [`test/podman.test.ts`](./test/podman.test.ts) | Its tests, on a fake `podman`. |

What it shows:

- **Ref candidates.** A volume has no folder host-cleaner may delete, so each
  candidate is a ref, `volume:<name>`, deleted by name. The core makes no
  folder checks on a ref, so `delete` checks for itself: it refuses a path
  candidate and any name Podman would not accept, which `discover` does not
  propose either.
- **A note from `detect`.** When `podman info` fails, as with a stopped
  Podman machine, the plugin is not detected and says why, so `status`, `plan`
  and `clean` show the reason. `podman info` gets 5 seconds, well under the
  detect hook's limit, so a Podman that hangs gives that note too.
- **`costDescription: 'lost'`.** A volume holds data nothing can download or
  rebuild. The core holds each one for review: it runs only with
  `--pick volume:<name>` and `--allow discard-user-data`.
- **Evidence.** Each candidate keeps the volume's creation time, as an
  instant, so the same time printed another way is not a change. A volume made
  again under the same name since the plan is another volume, and the re-check
  drops it as `changed`. A volume Podman lists with no creation time, or with
  Go's zero time in its place, is not proposed, since the re-check could not
  tell it changed.
- **A fake runner.** The tests give the kit a fake `podman` with
  `fakeRunner`, run the contract suite on it, and read `calls` to check that
  nothing was removed that should not have been.

## Settings

```json
{ "plugins": { "podman": { "package": "host-cleaner-podman", "keepVolumes": ["pgdata"] } } }
```

`keepVolumes` lists volume names never proposed. `--spare <name>` spares one
for a single run.

## Running its tests

They run with host-cleaner's own, from `packages/ts/host-cleaner`:

```sh
pnpm test examples/podman-plugin
```

There, `@osdlc/host-cleaner` resolves to the package's source. A package of
your own installs it, builds with `npm run build` and tests with `npm test`
instead. `tests/outside.test.ts` builds `src/index.ts` that way: with this
folder's `package.json` and `tsconfig.json`, in a package that sees only
`@osdlc/host-cleaner/plugin`, then loads it with the built host-cleaner's
loader, runs the contract suite on it there, and typechecks `test/` in the
same package. Run `pnpm build` first. That is the example's typecheck:
host-cleaner's own `tsc --noEmit` leaves this folder out.
