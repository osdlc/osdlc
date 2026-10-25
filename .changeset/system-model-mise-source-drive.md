---
"@osdlc/system-model": patch
---

A mise task declared in a file on another drive than the project (Windows) now keeps its absolute `source`, as one above the project root does. Before, its `source` was a path that named the wrong file. A file in the project whose name starts with two dots, such as `..tasks/build`, now reads as inside the project.
