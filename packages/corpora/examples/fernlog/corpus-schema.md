---
corpus-schema: 0
level: 2
extends:
  claims: "@osdlc/corpus-profile-claims"
  org: "../org-principles"
---

# fernlog

An example project corpus for a made-up command line tool, fernlog. It extends two parents:

- `claims`, the claims profile, by its package name. `package.json` installs it from
  `profiles/claims/` in this repository.
- `org`, the organisation's principles, by the path `../org-principles`.

Its own types:

- [decisions](decisions/decisions.schema.md): design decisions. Each one cites the org principles
  it follows, through `x-ref: org/principles`.
- [documents](documents/documents.schema.md) and
  [study-results](study-results/study-results.schema.md): the claims profile's types, used as they
  are.
- [statements](statements/statements.schema.md): the claims profile's statements, plus a `follows`
  link to an org principle.

Start with the decision
[Read config from the XDG folder](decisions/Read%20config%20from%20the%20XDG%20folder.md). It
follows two org principles and cites the statement that checks the behaviour it decided.

`_inherited/` holds a copy of both parents, written by `corpus-schema sync`. Links to the org's
principles go through it, so they resolve on GitHub and in Obsidian. Do not edit it by hand.
