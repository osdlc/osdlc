//! Display width of cell text in columns, as rumdl measures it with the
//! unicode-width crate. East Asian wide and fullwidth characters and emoji
//! take 2 columns, combining marks 0, and other characters 1. The Unicode
//! data is the same table the TypeScript twin ships, so both give the same
//! widths.

use crate::width_data::{FE0F_BASE, MODIFIER_BASE, WIDE, ZERO_WIDTH};

fn in_ranges(ranges: &[(u32, u32)], cp: u32) -> bool {
    ranges
        .binary_search_by(|&(start, end)| {
            if cp < start {
                std::cmp::Ordering::Greater
            } else if cp > end {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Equal
            }
        })
        .is_ok()
}

fn char_width(cp: u32) -> usize {
    if cp == 0x17d8 {
        return 3; // KHMER SIGN BEYYAL
    }
    if in_ranges(ZERO_WIDTH, cp) {
        0
    } else if in_ranges(WIDE, cp) {
        2
    } else {
        1
    }
}

/// The display width of `text` in terminal columns: the sum of its
/// characters' widths, except for two kinds of emoji sequence, which count 2
/// each: an emoji shown as text followed by U+FE0F, and an emoji followed by
/// a skin-tone modifier. Other ligatures, such as Arabic lam-alef, U+FE0E
/// after an emoji, and emoji ZWJ sequences (which [`pad_table`] does not
/// measure) count as the sum of their characters.
///
/// It gives what the unicode-width crate, 0.2.2, gives for the string. The
/// TypeScript twin keeps this function internal.
///
/// [`pad_table`]: crate::pad_table
pub fn display_width(text: &str) -> usize {
    let mut width = 0;
    // The previous character, and its width on its own.
    let mut prev: Option<u32> = None;
    let mut prev_width = 0;
    for ch in text.chars() {
        let cp = u32::from(ch);
        let own = char_width(cp);
        let after = |ranges| prev.is_some_and(|p| in_ranges(ranges, p));
        let w = if cp == 0xfe0f && after(FE0F_BASE) {
            1
        } else if (0x1f3fb..=0x1f3ff).contains(&cp) && after(MODIFIER_BASE) {
            2 - prev_width
        } else {
            own
        };
        width += w;
        prev = Some(cp);
        prev_width = own;
    }
    width
}

#[cfg(test)]
mod tests {
    use super::display_width;

    #[test]
    fn widths() {
        for (text, width) in [
            ("abc", 3),
            ("\u{4e2d}\u{6587}", 4),
            ("\u{1112}\u{1161}\u{11ab}", 2),
            ("e\u{301}", 1),
            ("\u{2705}", 2),
            ("\u{261d}", 1),
            ("\u{261d}\u{fe0f}", 2),
            ("\u{261d}\u{1f3fb}", 2),
            ("\u{261d}\u{1f3fb}\u{fe0f}", 2),
            ("\u{1f44d}\u{1f3fd}", 2),
            ("1\u{fe0f}\u{20e3}", 2),
            ("\u{1f1ef}\u{1f1f5}", 2),
            ("\u{a9} \u{a9}\u{fe0f}", 4),
            ("\u{ad}", 0),
            ("\u{17d8}", 3),
            ("", 0),
        ] {
            assert_eq!(display_width(text), width, "{text:?}");
        }
    }
}
