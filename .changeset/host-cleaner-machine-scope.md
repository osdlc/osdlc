---
"@osdlc/host-cleaner": minor
---

A plugin can declare `roots` for cleaning outside any checkout. The core refuses (`outside-roots`) a candidate of such a plugin that is not strictly inside one of them by its real path, and checks again right before `delete`. `containedIn` is exported.
