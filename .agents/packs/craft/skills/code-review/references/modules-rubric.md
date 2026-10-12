Modules and packages are how a codebase reuses work. Two failures cost the
most: code that hand-rolls what an existing package already provides, and
code with a clear second use that stays buried where it was written. The
opposite failure is just as real: a shared package created for one caller.
By default, co-locate first and promote when a second consumer appears, and
keep each module's public surface small. Where the project's instruction files
or standards place code differently, follow them.

Look for:

- Hand-rolled code for something the project already depends on or names in
  its library roster: argument parsing, schema validation, retry logic, path
  handling, date handling, a git or process wrapper. Read the project's
  instruction files (CLAUDE.md, AGENTS.md) and any library roster they name,
  and look at the shared-package directory they point to, before judging.
- A helper general enough that a second consumer is visible in the diff or in
  the repo, but still private to one file. Name the consumer and the module it
  should move to.
- A new shared module or package with one caller and no sign of another.
  Suggest keeping it beside that caller until a second one exists.
- Reaching into another module's internals: deep imports past its entry
  point, reading its private files, or depending on its non-public types.
- Test-only exports: a symbol exported from a module only so a test can reach
  it. Test through the public surface, or move the logic to a module whose
  public surface it belongs on.
- A module whose public surface grew by more than the change needs, or a
  dependency edge that points the wrong way (a low-level module importing a
  higher-level one).

Not a finding:

- Boundary rules a linter or import checker already enforces. Flag a boundary
  break only when no such tool covers it.
- A small helper used once. Duplicating five lines is cheaper than a package.
- A deliberate choice the project's instruction files or standards document,
  such as a preferred library for one job or a rule on where capabilities
  live.
- File placement that matches how the neighbouring files are organized.

Writing the finding: cite file:line. For a missed package, name the package
and the function to call. For a promotion, name the second consumer and the
destination module. For a boundary break, name the import and the public entry
point to use instead.
