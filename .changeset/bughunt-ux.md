---
'@osdlc/ux': patch
---

New `controlPattern(options)`: a global `RegExp` that matches, one character at a time, the control characters `stripControls` removes with the same options, for a filter that must keep the text's length. `stripControls` checks each character against the same set.
