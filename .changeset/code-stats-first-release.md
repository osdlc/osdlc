---
'@osdlc/code-stats': minor
---

First public release. `@osdlc/code-stats` counts lines of source by kind (logic, boilerplate, comment, doc, blank) for a folder, a commit, a change or two changes side by side, and says what happened to each line of a change (added, removed, changed or moved). It also reports file groups, change categories, the public API delta and complexity movers of a change, and writes PR descriptions with a package map and risk signals. It has three entry points (`@osdlc/code-stats`, `/scan` and `/tree-sitter`) and the `code-stats` command. It is deterministic and calls no model.

- **Breaking:** the `bun` export condition is gone, and the package no longer ships its TypeScript source. Every entry point loads the compiled `dist/`, with declarations.
- **Breaking:** the package supports Node 22 or later (`^22.22.2 || ^24.15.0 || >=26.0.0`) and no longer claims to run under Bun. A message that named how Bun reports a missing program is gone.
- 24 exports are marked `@experimental`, because they are building blocks the commands are made of: `buildPackageMap`, `renderPackageMap`, `renderRisk`, `renderDescription`, `riskSignals`, `PACKAGES_SECTION`, `RISK_SECTION`, `assignOperations`, `categorizeChange`, `dependencyChange`, `createTypescriptAnalyzer`, `createLizardAnalyzer`, `defaultAnalyzers`, `CHANGE_KINDS`, `ENTRY_KINDS`, `RULE_GROUPS`, and from `/scan` and `/tree-sitter` `addKindCounts`, `emptyKindCounts`, `stripBom`, `knownLanguages`, `languageNamed`, `classifyLines`, `BUILTIN_GRAMMARS` and `treeSitterScanner`. Their shape may change in any release. Nothing is removed or renamed.
- Every export has TSDoc and every value export is used by an example. A test checks the README's Stability section against the `@experimental` tags.
- `code-stats describe` reads package manifests through `@osdlc/system-model/build`.
- The README says Linux and macOS are tested and Windows is not.
