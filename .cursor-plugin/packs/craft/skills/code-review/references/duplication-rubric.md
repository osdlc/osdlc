Duplication is logic, strings or types the change writes that already exist,
or that now exist in two places. Two copies drift: a fix lands in one and the
other keeps the bug. The cheapest time to remove a copy is the diff that adds
it. The fix is to call the existing code, or to move the shared part to one
home both callers use.

Look for:

- A helper, type or constant the change declares that the repo already
  exports under another name. Search by behaviour, not only by name: grep for
  the distinctive call, regex or literal.
- A block copied from elsewhere with small edits, where the differences could
  be parameters.
- The same string literal, message, path or magic number written in several
  places, so changing one means finding the rest.
- A new implementation of something the change's own feature generalizes: the
  old bespoke version left standing beside its replacement.
- Parallel types or schemas that must be edited together to stay correct.

Not a finding:

- Similar shape with different meaning. Two loops over different data, or two
  functions that happen to look alike but change for different reasons, are
  not one concept. Merging them couples things that should move apart.
- Test fixtures, test setup and expected values. A test that spells out its
  data is easier to read than one that shares a builder with ten others.
- Two similar blocks when neither is a callable shared symbol. Name them if
  they are clearly the same concept, but do not demand an abstraction until a
  third copy appears or the shared meaning is clear. Re-implementing a helper
  the repo already exports is always a finding.
- Generated files, vendored code, and repetition a formatter or linter already
  reports.

A private helper that a second consumer should call, rather than copy, is a
modules finding, not a duplication finding.

Writing the finding: cite the new code and the existing code, each as
file:line. Name the canonical home: the existing symbol to call, or the
module where the shared version should live. Say what differs between the
copies, if anything, so the author can tell whether a parameter is enough.
