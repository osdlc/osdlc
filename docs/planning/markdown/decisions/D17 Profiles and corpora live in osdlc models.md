---
title: Profiles and corpora live in osdlc/models
status: decided
decided: "2026-11-12"
---

Each repo has one job:

- osdlc/osdlc holds the sdlc CLI, the plugins and their libraries.
- osdlc/markdown holds the Markdown libraries, the corpus-schema spec and validator, and examples.
  It holds no shared content.
- osdlc/models holds model-schema, the packs (pack-intent, pack-sdlc and a future pack-claims), the
  profiles generated from them (`@osdlc/corpus-profile-sdlc`, `@osdlc/corpus-profile-claims`) and
  starter corpora (`@osdlc/corpus-sdlc-starter`). The owner creates it.
- osdlc/marketplace stays the plugin marketplace.

Research corpora live in their own project's repo, such as skillwright's harness-reference. They
extend the claims profile from npm.

The claims profile is a general starting profile. A corpus uses it as it is or extends it, and many
research corpora will build on it. So it sits beside the sdlc profile, not with one research
project.

Until osdlc/models exists and the packs move (task 62), the profiles and the starter stay in
osdlc/markdown, in `profiles/` and `corpora/`, where the release setup is. They move together. The
npm names do not change, so consumers see no change.

Shared types are authored as packs. A pack defines a field once and uses it in many kinds, binds a
kind to a folder, and carries relations and rules
([D13](D13%20The%20model%20layer%20sits%20above%20store%20specs.md)). The type folders of a shared
profile are generated output and are not edited by hand. Hand-written colocated schemas stay for a
corpus's own local types. corpus-schema keeps "each type's schema stands alone": no `$ref` across
type schemas and no shared-definitions folder. That can be revisited in 0.x if hand-written
profiles need it.

It builds on [D11](D11%20Upstream%20corpora%20travel%20as%20npm%20packages.md),
[D14](D14%20The%20first%20upstream%20instance%20is%20a%20starter%20corpus.md) and
[D15](D15%20Extending%20types%20and%20referencing%20corpora%20are%20separate.md).
