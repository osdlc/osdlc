---
"@osdlc/corpus-schema": patch
---

validate: a file outside a record folder that fails as a record now gets a hint when it may be supporting data. That means it sits in a subfolder with no record file, or is a `.yaml`/`.json` file among mostly `.md` records. The hint says to add the record file (or set `x-record-file`) or to move the files under a `_` folder, and stays on the error's line. The `.yml` error gets one too. Messages only: which files are records is unchanged.
