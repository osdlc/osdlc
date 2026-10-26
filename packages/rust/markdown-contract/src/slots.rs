//! The slot resolver: which declared slot each section fills, ported from the TS
//! `slots.ts`. The structure plane ([`crate::structure`]) and the content plane
//! ([`crate::content`]) both read the grammar through it, so they agree on the same
//! document, and the TS package decides the same.
//!
//! - [`slots_of`]: a level's `section` and `oneOf` slots, in declared order, gaps left
//!   out and `optional(...)` unwrapped.
//! - [`bind_slots`]: each section at a level and the slot it matches. A section matches
//!   the first slot that names it. It fills that slot when the slot is repeatable, or
//!   when it is the first section to match the slot (by any of the slot's spellings). A
//!   later one is a duplicate, which the structure plane reports.
//!
//! The block a leaf checks is [`SectionNode::block_for`]: the block whose `^anchor` is a
//! named leaf's record key, else the section's first block.

use std::collections::HashSet;

use crate::contract::{SectionOpts, Spec};
use crate::tree::SectionNode;

/// A declared section/oneOf slot, after `optional(...)` is unwrapped.
pub(crate) struct Slot<'a> {
    /// index into the level's `specs` array (the gap-bearing one)
    pub(crate) spec_idx: usize,
    /// the admissible heading spellings (alias set for oneOf / alias sections)
    pub(crate) names: &'a [String],
    pub(crate) optional: bool,
    pub(crate) repeatable: bool,
    pub(crate) min: Option<usize>,
    pub(crate) max: Option<usize>,
    pub(crate) opts: Option<&'a SectionOpts>,
}

impl<'a> Slot<'a> {
    pub(crate) fn admits(&self, name: &str) -> bool {
        self.names.iter().any(|n| n == name)
    }

    pub(crate) fn label(&self) -> String {
        self.names.join("’ / ‘")
    }

    /// The slot's effective hint: its node `description`, else the enclosing level's.
    pub(crate) fn hint<'h>(&self, level: Option<&'h str>) -> Option<&'h str>
    where
        'a: 'h,
    {
        self.opts.and_then(|o| o.description.as_deref()).or(level)
    }
}

fn make_slot<'a>(
    spec_idx: usize,
    names: &'a [String],
    optional: bool,
    opts: Option<&'a SectionOpts>,
) -> Slot<'a> {
    Slot {
        spec_idx,
        names,
        optional: optional || opts.is_some_and(|o| o.optional),
        repeatable: opts.is_some_and(|o| o.repeatable),
        min: opts.and_then(|o| o.min),
        max: opts.and_then(|o| o.max),
        opts,
    }
}

/// Project the declared `Spec[]` into the ordered list of section/oneOf slots (gaps excluded).
pub(crate) fn slots_of(specs: &[Spec]) -> Vec<Slot<'_>> {
    let mut slots = Vec::new();
    for (spec_idx, spec) in specs.iter().enumerate() {
        let (inner, optional) = spec.unwrap_optional();
        match inner {
            Spec::Section(s) => {
                slots.push(make_slot(spec_idx, &s.names, optional, s.opts.as_ref()))
            }
            Spec::OneOf(o) => slots.push(make_slot(spec_idx, &o.names, optional, o.opts.as_ref())),
            _ => {}
        }
    }
    slots
}

/// The index of the first slot whose name set contains `name`, or `None` (unknown).
pub(crate) fn slot_for(slots: &[Slot<'_>], name: &str) -> Option<usize> {
    slots.iter().position(|s| s.admits(name))
}

/// A doc section paired with the declared slot it matches.
pub(crate) struct SlotBinding<'a> {
    pub(crate) node: &'a SectionNode,
    /// index into the level's slots, or `None` when the section matches no declared slot
    pub(crate) slot_idx: Option<usize>,
    /// The section fills its slot: the slot is repeatable, or this is the first section
    /// to match it. False for an unknown section and for a duplicate of a filled slot.
    pub(crate) fills: bool,
}

/// Bind each section in `nodes` to its slot, in document order, as the module docs say.
pub(crate) fn bind_slots<'a>(nodes: &'a [SectionNode], slots: &[Slot<'_>]) -> Vec<SlotBinding<'a>> {
    let mut filled = HashSet::new();
    nodes
        .iter()
        .map(|node| {
            let slot_idx = slot_for(slots, &node.name);
            let fills = slot_idx.is_some_and(|i| slots[i].repeatable || !filled.contains(&i));
            if let Some(i) = slot_idx {
                filled.insert(i);
            }
            SlotBinding {
                node,
                slot_idx,
                fills,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::{one_of, optional, section, section_with};
    use crate::finding::SourcePos;

    fn node(name: &str) -> SectionNode {
        SectionNode::new(name, 2, SourcePos::line(1))
    }

    #[test]
    fn a_section_fills_the_first_slot_that_names_it_once_unless_repeatable() {
        let specs = vec![
            optional(section("A")),
            one_of(["B", "Bee"]),
            section_with(
                "C",
                SectionOpts {
                    repeatable: true,
                    ..Default::default()
                },
            ),
            section("A"),
        ];
        let slots = slots_of(&specs);
        assert_eq!(slots.len(), 4);
        assert!(slots[0].optional);
        let nodes: Vec<SectionNode> = ["A", "B", "Bee", "C", "C", "X", "A"]
            .into_iter()
            .map(node)
            .collect();
        let got: Vec<(Option<usize>, bool)> = bind_slots(&nodes, &slots)
            .iter()
            .map(|b| (b.slot_idx, b.fills))
            .collect();
        assert_eq!(
            got,
            vec![
                (Some(0), true),
                (Some(1), true),
                (Some(1), false), // a second spelling of a filled alias set
                (Some(2), true),
                (Some(2), true), // a repeatable slot takes every occurrence
                (None, false),
                (Some(0), false), // the first slot that names it, already filled
            ]
        );
    }
}
