---
as_of: "2026-11-11"
sources:
  - >-
    Rechecked 2026-11-11: sksizer/dev PRs #4069 and #4070 merged into code-intelligence-planning,
    which open PR #4068 takes to main; the package names and paths of @osdlc/pack-intent and
    @osdlc/pack-sdlc; npm versions of @osdlc/corpus-schema (0.2.1) and @osdlc/package-checks (0.2.0).
  - >-
    Rechecked 2026-11-10: osdlc/markdown main (3c8f6fe) and open PRs #12, #15 and #16; osdlc/osdlc
    PRs #767, #773 and #774; npm versions of @osdlc/package-checks and @osdlc/conformance-suites.
    Other facts below are as of 2026-11-09.
  - >-
    osdlc/markdown main (de5bb97): docs/architecture.md, docs/ecosystem-plan.md,
    docs/corpus-schema.md, tools/diagrams/build.py, tools/diagrams/architecture.py,
    profiles/claims/, .github/workflows/examples.yml
  - "osdlc/markdown open PRs #9 (move corpus-schema, 1ad5a95) and #10 (shared CI, 4548e92)"
  - >-
    osdlc/osdlc main (c4886b06): packages/ts/*/package.json, packages/rust/Cargo.toml and each
    crate's Cargo.toml, packages/conformance/families.json, .github/workflows/ts-packages-ci.yml and
    ts-packages-release.yml
  - >-
    osdlc/osdlc PRs #649, #650, #651, #719, #720 (branch feat/markdown-render), #728, #730, #746,
    #748, #749, #750
  - >-
    osdlc/skillwright main (08504e2): harness-reference/package.json,
    harness-reference/corpora/beta, packages/rust/Cargo.toml, skillwright and tradecraft-core
    Cargo.toml; PRs #74, #95, #97
  - >-
    sksizer/dev main (adb63f43df): packages/ts/*/package.json, solutions/ontological and
    solutions/determined package.json files, vendor/; PRs #4069 and #4070; task T-1NC5
  - "sksizer/rust-ontogen main (128bb5e): Cargo.toml, crates/markdown-store/Cargo.toml"
  - >-
    npm registry (npm view <name> version) and crates.io API (/api/v1/crates/<name>), checked
    2026-11-09
  - >-
    Overlap evidence, read on main unless named: osdlc/osdlc
    packages/ts/corpus-schema/src/validate.ts and links.ts,
    packages/ts/markdown-contract/src/core/frontmatter.ts; sksizer/dev
    packages/ts/{markdown-link,markdown-tags,markdown-vault,vault-graph-core,markdown-astro,markdown-render}/src,
    vendor/markdown-contract-0.2.1.tgz,
    solutions/determined/apps/{vault-graph,connector,vault-digest,workflow-designer}; rust-ontogen
    crates/markdown-store/src; osdlc/skillwright harness-reference/corpora/beta/*/*.schema.md;
    model-schema at the head of sksizer/dev#4069 (64b7132)
---

The facts behind `ecosystem.json`: the date they were checked and where they were taken from.
