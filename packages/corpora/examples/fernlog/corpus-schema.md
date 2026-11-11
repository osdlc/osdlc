---
corpus-schema: 0
level: 2
extends:
  claims: "@osdlc/corpus-profile-claims"
references:
  org: "../org-principles"
uses: [claims/documents, claims/study-results]
---

# fernlog

An example project corpus for a made-up command line tool, fernlog. It names two other corpora:

- It extends `claims`, the claims profile, by its package name, for its types. `package.json`
  installs it from `profiles/claims/` in this repository.
- It references `org`, the organisation's principles, by the path `../org-principles`, for its
  records.

Its own types:

- [decisions](decisions/decisions.schema.md): design decisions. Each one cites the org principles
  it follows, through `x-ref: org/principles`.
- [documents](documents/) and [study-results](study-results/): the claims profile's types, used as
  they are through `uses`, with no schema files.
- [statements](statements/statements.schema.md): the claims profile's statements, plus a `follows`
  link to an org principle.

Start with the decision
[Read config from the XDG folder](decisions/Read%20config%20from%20the%20XDG%20folder.md). It
follows two org principles and cites the statement that checks the behaviour it decided.

`_references/org/` holds a copy of the org principles, written by `corpus-schema sync`. Links to
them go through it, so they resolve on GitHub and in Obsidian. Do not edit it by hand. The claims
profile gives types only, so it has no copy.
