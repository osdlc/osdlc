---
title: Vaults install corpora outside the vault
status: open
---

A personal Obsidian vault should not need `package.json` or `node_modules` to extend a profile or
reference a corpus. This is proposed, not decided.

The shape:

- The root file states a version range in each source:
  `extends: { workout: "@acme/corpus-profile-workout@^1.0" }` and
  `references: { nutrition: "@acme/corpus-nutrition@^2.3" }`.
- `corpus-schema install` fetches those packages with npm's fetcher, pacote, into a cache outside
  the vault. The cache holds one folder per package name and version, in the user's cache
  directory, such as `~/.cache/corpus-schema/`.
- It writes `corpus-schema.lock.yaml` beside the root file. The tool writes it and it is committed.
  For each package it records the name, the exact version, the integrity hash and the prefix the
  package is used under. It is YAML because only the tool writes it, and Obsidian hides `.yaml`
  files from its file list and search.
- `sync` and `validate` resolve from the cache when the lockfile is present. `corpus-schema update`
  moves each package to a newer version inside its range and rewrites the lockfile. Install checks
  each package against its integrity hash.
- The vault holds only notes, the `_references/` copies and the lockfile.

Resolution order. If a lockfile and a `node_modules` folder both exist, the lockfile wins and
`node_modules` is ignored. One rule is easier to explain than a
merge. It can be loosened later.

Prior art: Deno keeps a global cache and `deno.lock`. Go keeps a module cache and `go.sum`. In both
the project folder holds a lockfile and no copies of the dependencies.

This does not change the beeline. Corpora installed through npm already work there. It comes after
corpus-schema 0.4.0 (task 36), and it builds on
[D11](D11%20Upstream%20corpora%20travel%20as%20npm%20packages.md) and
[D15](D15%20Extending%20types%20and%20referencing%20corpora%20are%20separate.md).

The spec changes are a version range in a package source and the lockfile's name, format and
meaning, plus the resolution order above. The rest is tooling.

Open points:

- Cache location on each OS. XDG on Linux is clear. macOS and Windows may use their own cache
  directories.
- Private registries and auth. Install may read `.npmrc` as pacote does, or take its own settings.
- Git sources. A package source may point at a git URL, and the lockfile would record the commit.
- Offline use. With a warm cache and a lockfile, `sync` and `validate` need no network. Install
  from a cold cache does.
- The lockfile's name. If the root file is renamed to `<name>.corpus-schema.md`, as the open "root
  file name" question proposes, the lockfile becomes `<name>.corpus-schema.lock.yaml`.
