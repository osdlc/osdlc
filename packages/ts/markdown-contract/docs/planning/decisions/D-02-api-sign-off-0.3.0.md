---
id: D-02
type: decision
state: accepted
created: 2026-10-18
---

# D-02: API sign-off for 0.3.0

## Decision

- The public API of the first release, 0.3.0, is the one in
  [osdlc/osdlc#289](https://github.com/osdlc/osdlc/pull/289). It has four
  entry points:
  - `@osdlc/markdown-contract`: `./core` plus the folder runner (`runCorpus`,
    `defineConfig`, `CorpusConfig`, `RunStats`).
  - `@osdlc/markdown-contract/core`: contracts, grammar, content leaves,
    rules, the typed model and the parse tree. It imports no Node module.
  - `@osdlc/markdown-contract/declarative`: YAML contracts and configs.
  - `@osdlc/markdown-contract/cli`: `runCli` and `CliResult`.
- The `markdown-contract` bin is its own file and always runs. It works
  through a symlink, such as the one npm makes in `node_modules/.bin`.
- `zod` is a peer dependency (`^4`). The package uses zod's own `ZodType`.
- Internal functions and types are not exported. `VERSION` is not exported.
- The API was first signed off before the review of #289. Ten more changes
  were made in review and accepted when #289 was merged:
  1. `BlockNode` has no `typed()`, `typedItem()`, `setTyped()` or
     `setTypedItem()`. Parsed cell and item values belong to one `validate()`
     call and are read from the typed model, so contracts that share a parse
     tree do not see each other's values.
  2. `inferBounds` and the `--infer-bounds` flag are removed. They did
     nothing.
  3. `ContractBuildError` is exported. Building a grammar that cannot work,
     such as two sections with the same key, throws it with an `id` such as
     `contract/key-collision`.
  4. Broken frontmatter YAML gives a `frontmatter/yaml` finding. `parse` and
     `validate` no longer throw on it, and the frontmatter schema is not run
     over it.
  5. `DeclarativeDoc` is no longer exported from `./declarative`.
  6. `compileContractObject` has no `mcVersion` argument. It rejects any
     `mcVersion` other than 2.
  7. `validate` takes one path, and each command rejects flags that belong to
     another command.
  8. `migrate` loads each result before it prints or writes it, leaves a
     result that does not load alone (exit code 2), skips a file that is
     already version 2 with a note, and separates several documents with `---`
     and `# <file>`.
  9. `runCorpus`, `validate` and `inferConfig` skip `.git` and `node_modules`
     folders.
  10. `parse()` applies the micromark extensions in `ParseOptions.extensions`.
      `inferConfig` and `init` stop and name the file when its frontmatter is
      not valid YAML.

## Why

- A first public release fixes the names and shapes that users depend on, so
  the surface was reviewed export by export before it shipped. Each export has
  TSDoc and an example, and a test checks both.
- The ten later changes remove behaviour that was wrong, did nothing or leaked
  internals. Making them before the first release costs nothing, because no
  user has the old surface.
- A smaller export list is cheaper to keep stable. Internals stay free to
  change.

## Consequences

- From 0.3.0 on, a breaking change to a stable export goes in a minor release
  and is marked `Breaking` in the CHANGELOG (see
  [D-03](D-03-stability-tiers.md)).
- Adding an export means adding TSDoc, an example and a README entry. A test
  fails when one is missing.
