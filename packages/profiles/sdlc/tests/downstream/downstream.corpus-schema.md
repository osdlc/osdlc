---
corpus-schema: 0
level: 2
extends:
  sdlc: "@osdlc/corpus-profile-sdlc"
references:
  osdlc: "@osdlc/corpus-sdlc-starter"
uses: [sdlc/*]
---

# Downstream fixture

A work repo's corpus. It takes its types from the sdlc profile and references the sdlc starter, so
its principles can cite the starter's. `tests/package.sh` installs both packages beside it, runs
`sync` to write `_references/osdlc/`, and validates it.
