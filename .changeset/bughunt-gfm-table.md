---
'@osdlc/gfm-table': patch
---

`insertCellSplice` at column 0 of a row indented one to three spaces now reads the row's leading pipe as opening it and puts the new cell after that pipe, as it does for an unindented row (`  | a |` becomes `  |  | a |`). Before, it took the row for one with no opening pipe and added a second one.
