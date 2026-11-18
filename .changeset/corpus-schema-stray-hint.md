---
"@osdlc/corpus-schema": patch
---

validate: a file that fails as a record and may be supporting data outside a record folder, in a subfolder with no record file or a `.yaml`/`.json` file in a type whose records are mostly `.md`, now gets a hint to add the record file (or set `x-record-file`) or to move the files under a `_` folder. The `.yml` error gets one too. Messages only: which files are records is unchanged.
