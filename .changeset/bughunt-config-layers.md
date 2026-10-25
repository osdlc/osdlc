---
'@osdlc/config-layers': patch
---

Behaviour change: a secret key set to a scalar in the project file is now refused, as an object value already was; before, only an object value was checked. Behaviour change: scaffold output changed. Array defaults render each element as its own value (a number or boolean is no longer quoted), a string starting with `+` or `.` is quoted, and a nested object under a `.default({...})` renders the values in that default, with keys it lacks commented out, instead of the children's own schema defaults.
A load that salvages a partly invalid machine config file no longer deletes keys from the caller's object. `substitutePathNames` resolves only own names, so `{constructor}` no longer picks up `Object.prototype`'s. `consumerProblems` finds a symbol whose name holds a `$`.
