---
"@osdlc/system-model": minor
---

Remove the viewer-port entries and items. The system-graph viewer defines them now, so this package no longer carries them, and there are no deprecated aliases.

- The `./client` entry and `SystemGraphClient`.
- The `./saved-view` entry and `SavedView`, `SavedViewStore`, `PositionOverride`, `slugify` and `SLUG_PATTERN`.
- `ProjectFacets` and `ProjectFacetsStore`, exported from the root entry.
