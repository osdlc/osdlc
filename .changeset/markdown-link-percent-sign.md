---
'@osdlc/markdown-link': patch
---

Fixed: `percentDecode` takes an escape only when both characters after `%` are hex digits, so `%+5` stays as written instead of decoding. It had copied a quirk of Rust's `u8::from_str_radix`, which accepts a sign; the Rust crate's `percent_decode` is fixed the same way.
