---
corpus-schema: 0
level: 2
extends:
  sdlc: "@osdlc/corpus-profile-sdlc"
uses: [sdlc/*]
---

# sdlc starter

Shared records for an sdlc planning corpus. The types come from the sdlc profile: each folder
here takes the profile's type of its name, through `uses`. The package's README says how a repo
references this corpus and cites its records.

- [principles](principles/): beliefs that drive design judgment.
