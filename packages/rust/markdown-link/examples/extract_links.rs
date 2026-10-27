//! Find every link in a note body, with its byte span.

use markdown_link::{BodyLinkKind, body_links_spanned, strip_code};

fn main() {
    let body = "See [[Plan#Goals|the plan]] and ![[diagram.png|300]].\n\
                A markdown link: [spec](docs/spec.md).\n\
                Code is skipped: `[[not-a-link]]`.\n";

    for link in body_links_spanned(body) {
        let kind = match link.kind {
            BodyLinkKind::Wikilink => "wikilink",
            BodyLinkKind::Embed => "embed",
            BodyLinkKind::Markdown => "markdown",
        };
        let written = &body[link.byte_start..link.byte_end];
        println!(
            "{kind:8} target={:<12} alias={:?} text={written}",
            link.target, link.alias
        );
    }

    // The same text with code blanked, as the scanner sees it.
    assert!(!strip_code(body).contains("not-a-link"));
}
