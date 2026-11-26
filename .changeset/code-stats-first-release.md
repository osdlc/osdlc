---
'@osdlc/code-stats': minor
---

First public release. `@osdlc/code-stats` counts lines of source by kind (logic, boilerplate, comment, doc, blank) for a folder, a commit, a change or two changes side by side, and says what happened to each line of a change (added, removed, changed or moved). It also reports file groups, change categories, the public API delta and complexity movers of a change, and writes PR descriptions with a package map and risk signals. It has five entry points (`@osdlc/code-stats`, `/scan`, `/prep`, `/analysis` and `/tree-sitter`) and the `code-stats` command. It is deterministic and calls no model.

- **Breaking:** the `bun` export condition is gone, and the package no longer ships its TypeScript source. Every entry point loads the compiled `dist/`, with declarations.
- **Breaking:** the package supports Node `^22.22.2`, `^24.15.0` or `>=26.0.0` and no longer claims to run under Bun. A message that named how Bun reports a missing program is gone.
- 24 exports are marked `@experimental`, because they are building blocks the commands are made of: `buildPackageMap`, `renderPackageMap`, `renderRisk`, `renderDescription`, `riskSignals`, `PACKAGES_SECTION`, `RISK_SECTION`, `assignOperations`, `categorizeChange`, `dependencyChange`, `createTypescriptAnalyzer`, `createLizardAnalyzer`, `defaultAnalyzers`, `CHANGE_KINDS`, `ENTRY_KINDS`, `RULE_GROUPS`, and from `/scan` and `/tree-sitter` `addKindCounts`, `emptyKindCounts`, `stripBom`, `knownLanguages`, `languageNamed`, `classifyLines`, `BUILTIN_GRAMMARS` and `treeSitterScanner`. Their shape may change in any release. Nothing is removed or renamed.
- `code-stats prep` and `runPrep` (from `@osdlc/code-stats/prep`) read a pull request, a branch or the working tree and print one deterministic JSON manifest for a reviewer: the files worth reading, the files to set aside and why (`generated`, `vendored` or `formatting-only`), review groups by package root, and reading-order flags. The manifest is `schema: 2` and is validated by `prepManifestSchema`. A failure is a `CodeStatsError`. File facts are the ones `code-stats diff` measures, and `--base <ref>` with `--worktree` diffs the merge base of `<ref>` and `HEAD` against the working tree.
- `prep` does not follow a symlink when it reads the checkout, and does not read through a linked directory that leaves the repository, so a tracked link cannot make a run read a file outside the repository.
- `@osdlc/code-stats/analysis` is experimental throughout: `diffApi` (with the types `ApiMap` and `ApiDelta`) compares the public API of two versions of a file, and `loadTypeScript` and `parseSource` find the optional `typescript` compiler and parse a file with it, for a check of a package's exported API.
- `PACKAGE_MARKERS`, `packageRoots`, `nearestRoot` and `buildGroups`, from `/prep`, are experimental as well.
- Every export has TSDoc and every value export is used by an example. A test checks the README's Stability section against the `@experimental` tags.
- `code-stats describe` reads package manifests through `@osdlc/system-model/build`.
- The README says Linux and macOS are tested and Windows is not.
