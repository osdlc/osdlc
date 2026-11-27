---
"@osdlc/system-model": minor
---

**Breaking:** remove the viewer-port entries and items. They described one viewer's interface to its hosts, not a repository's model, so a viewer now defines them itself: copy the definitions from 0.10 into the viewer that uses them. There are no deprecated aliases.

- The `./client` entry and `SystemGraphClient`.
- The `./saved-view` entry and `SavedView`, `SavedViewStore`, `PositionOverride`, `slugify` and `SLUG_PATTERN`.
- `ProjectFacets` and `ProjectFacetsStore`, exported from the root entry.
