---
'@osdlc/corpus-schema': minor
---

Record folders. A folder inside a type folder that holds a record named after it, such as `methods/Survey/Survey.md`, is one record with the folder's name as its id. Every other file under the folder belongs to the record: it is not a record and is not checked. Links from the record to those files resolve, as do links into another record's folder. A record folder inside another one is an error, reported as `<folder>: (folder)`. A folder with no record named after it stays a plain folder, as before. The spec states this as part of level 1.
