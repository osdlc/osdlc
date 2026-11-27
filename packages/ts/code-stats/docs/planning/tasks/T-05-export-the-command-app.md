---
id: T-05
type: task
state: open
created: 2026-11-26
---

# T-05: Export the command app

## Goal

A program can run the `code-stats` command, or bundle it into one file, from an entry the
package exports, without reaching into `dist/`.

## Today

The app, `createApp` and `app` in `src/cli/main.ts`, is not an export. A consumer that ships the
command as a single bundled file has two ways in, and neither works well:

- `bin/code-stats.js` is a bare import of `dist/cli/bin.js`. The package declares
  `sideEffects: false`, so a bundler drops that import and the bundle is empty.
- `dist/cli/bin.js` runs the app with the devlink hook. A bundled copy then hands each run to
  the project's own install, which a copy shipped on its own does not want.

So the consumer imports `dist/cli/main.js` by path and calls `runMain` itself. That path is not
part of the package's API: a release that moves the file breaks the consumer's bundle, and
nothing catches it until the bundle is rebuilt.

## Approach

1. Add an experimental `./cli` entry that exports `app` and `createApp` from `src/cli/main.ts`.
   It loads the command framework, which is expected for this entry. The library entry stays
   free of it (see [T-03](T-03-import-the-library-without-the-command-framework.md)).
2. Mark both exports `@experimental` with TSDoc, and add an example under `examples/` that runs
   `app` through `runMain` with no devlink hook.
3. Replace `"sideEffects": false` with a list naming `./bin/code-stats.js` and
   `./dist/cli/bin.js`, so a bundler keeps a bare import of the bin too.
4. List the entry in the README and the changeset.

## Acceptance criteria

- [ ] `import { app } from '@osdlc/code-stats/cli'` resolves, and `runMain(app.main, …)` runs
      `count`, `diff` and `prep`.
- [ ] Bundling `bin/code-stats.js` gives a file that runs `code-stats --version`.
- [ ] `package-checks` passes, with the new entry's exports documented and covered by an example.
