---
'@osdlc/observe': patch
---

Add an optional `task` to the `launched` event and the session record: the basename of the task the session serves. The reducer copies it onto the record, and a `null` or missing `task` leaves it absent, so logs written before it still read.
