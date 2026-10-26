# Subpaths

`parseLinktext` splits on the first `#` only, and everything after it is
display, not addressing.

A heading: [[note#Heading]].

A heading chain, which keeps its inner hashes verbatim: [[note#h#sub]].

A block id: [[note#^abc123]].

A hash after the first pipe belongs to the alias: [[note|alias#notaheading]].

Same file, by heading: [[#Heading]].

Same file, by block: [[#^abc123]].

A whole-note embed: ![[note]].

A section embed, which the compiler must refuse rather than expand whole:
![[note#Heading]].

A block embed, likewise: ![[note#^abc123]].

A PDF page fragment, which is neither heading nor block: ![[assets/doc.pdf#page=3]].
