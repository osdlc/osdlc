//! The structure plane — the tree-grammar matcher, ported finding-for-
//! finding from the TS `structure.ts`.
//!
//! [`match_structure`] walks the projection's section tree against a level's ordered
//! `Spec[]`, recursing through `children`, and emits the `structure/*` findings:
//!
//! - section presence       — `structure/section-missing`
//! - ordering               — `structure/section-order` (order × allowUnknown × gap)
//! - gap windows            — `structure/gap-count`
//! - duplicates / aliases   — `structure/duplicate-section`
//! - camelCase collisions   — `structure/key-collision`
//! - repeatable bounds      — `structure/repeat-count`
//! - the block kind-gate    — `structure/block-missing`, `structure/block-kind`
//! - anchors                — `structure/anchor-missing`
//! - node-local rules       — [`Rule`](crate::contract::Rule) carriers run here
//!
//! Kind and presence are structure; data shape is content. This plane reads
//! `LeafSpec::kind` only — the data checks are the content plane's ([`crate::content`]).

use std::collections::{BTreeMap, HashMap, HashSet};

use crate::camel::to_camel_key;
use crate::contract::{GapSpec, LeafSpec, Order, SectionContent, SectionOpts, SectionSeq, Spec};
use crate::finding::Finding;
use crate::registry::{Ctx, FindingSpec};
use crate::tree::{BlockNode, SectionNode};

// ── Spec inspection helpers ──────────────────────────────────────────────────────────

/// A declared section/oneOf slot, after `optional(...)` is unwrapped.
struct Slot<'a> {
    /// index into the level's `specs` array (the gap-bearing one)
    spec_idx: usize,
    /// the admissible heading spellings (alias set for oneOf / alias sections)
    names: &'a [String],
    optional: bool,
    repeatable: bool,
    min: Option<usize>,
    max: Option<usize>,
    opts: Option<&'a SectionOpts>,
}

impl<'a> Slot<'a> {
    fn admits(&self, name: &str) -> bool {
        self.names.iter().any(|n| n == name)
    }

    fn label(&self) -> String {
        self.names.join("’ / ‘")
    }

    /// The slot's effective hint: its node `description`, else the enclosing
    /// level's — `None` all the way up for v1 / description-free contracts.
    fn hint<'h>(&self, level: Option<&'h str>) -> Option<&'h str>
    where
        'a: 'h,
    {
        self.opts.and_then(|o| o.description.as_deref()).or(level)
    }
}

/// The effective hint for a heading name at one level: the admitting slot's, else the
/// level's inherited hint (unknown sections fall through to the level).
fn hint_for_name<'h>(slots: &[Slot<'h>], name: &str, level: Option<&'h str>) -> Option<&'h str> {
    slots
        .iter()
        .find(|s| s.admits(name))
        .and_then(|s| s.hint(level))
        .or(level)
}

/// Unwrap `optional(spec)` to its inner spec, tracking optionality.
fn unwrap(spec: &Spec) -> (&Spec, bool) {
    match spec {
        Spec::Optional(inner) => {
            let (i, _) = unwrap(inner);
            (i, true)
        }
        other => (other, false),
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
fn slots_of(specs: &[Spec]) -> Vec<Slot<'_>> {
    let mut slots = Vec::new();
    for (spec_idx, spec) in specs.iter().enumerate() {
        let (inner, optional) = unwrap(spec);
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
fn slot_for(slots: &[Slot<'_>], name: &str) -> Option<usize> {
    slots.iter().position(|s| s.admits(name))
}

/// Whether `name` matches a declared REPEATABLE slot — its peers are admitted, not errors.
fn is_repeatable_name(slots: &[Slot<'_>], name: &str) -> bool {
    slots.iter().any(|s| s.repeatable && s.admits(name))
}

// ── The per-level match ──────────────────────────────────────────────────────────────

/// A doc section paired with the declared slot it matches (or `None` when unknown).
struct Assigned<'a> {
    node: &'a SectionNode,
    slot_idx: Option<usize>,
}

/// Duplicate-heading and camelCase key-collision detection at one level. A
/// heading matching a declared REPEATABLE slot is exempt from both.
fn check_duplicate_headings(
    nodes: &[SectionNode],
    slots: &[Slot<'_>],
    level_hint: Option<&str>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    let mut seen_name: HashSet<&str> = HashSet::new();
    let mut seen_key: HashMap<String, &str> = HashMap::new(); // camelKey → first heading
    for node in nodes {
        if seen_name.contains(node.name.as_str()) {
            if !is_repeatable_name(slots, &node.name) {
                out.push(
                    ctx.finding(
                        FindingSpec::new(
                            "structure/duplicate-section",
                            format!(
                                "duplicate section ‘{}’; a heading must not repeat at one level",
                                node.name
                            ),
                        )
                        .pos(node.pos)
                        .hint_opt(hint_for_name(slots, &node.name, level_hint)),
                    ),
                );
            }
            continue; // a duplicate cannot also collide a new key
        }
        seen_name.insert(&node.name);
        let key = to_camel_key(&node.name);
        if key.is_empty() {
            continue;
        }
        match seen_key.get(&key) {
            None => {
                seen_key.insert(key, &node.name);
            }
            Some(&first) if first != node.name && !is_repeatable_name(slots, &node.name) => {
                out.push(ctx.finding(
                    FindingSpec::new(
                        "structure/key-collision",
                        format!(
                            "‘{}’ and ‘{}’ collapse to the same key ‘{}’; headings must yield distinct keys at one level",
                            node.name, first, key
                        ),
                    )
                    .pos(node.pos)
                    .hint_opt(hint_for_name(slots, &node.name, level_hint)),
                ));
            }
            Some(_) => {}
        }
    }
}

/// Repeatable-slot occurrence bounds (min / max) → `structure/repeat-count`. `max` bites
/// at the first surplus occurrence; `min` bites only once the slot is present (count 0
/// for a required slot is `structure/section-missing`, its absence — not its count).
fn check_repeat_bounds(
    nodes: &[SectionNode],
    slots: &[Slot<'_>],
    level_hint: Option<&str>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    for slot in slots {
        if !slot.repeatable || (slot.min.is_none() && slot.max.is_none()) {
            continue;
        }
        let matches: Vec<&SectionNode> = nodes.iter().filter(|n| slot.admits(&n.name)).collect();
        let count = matches.len();
        if let Some(max) = slot.max
            && count > max
        {
            let mut spec = FindingSpec::new(
                "structure/repeat-count",
                format!(
                    "repeatable section ‘{}’ occurs {count} times; expected at most {max}",
                    slot.label()
                ),
            )
            .hint_opt(slot.hint(level_hint));
            if let Some(offender) = matches.get(max) {
                spec = spec.pos(offender.pos); // the first occurrence past the bound
            }
            out.push(ctx.finding(spec));
            continue;
        }
        if let Some(min) = slot.min
            && count > 0
            && count < min
        {
            let mut spec = FindingSpec::new(
                "structure/repeat-count",
                format!(
                    "repeatable section ‘{}’ occurs {count} times; expected at least {min}",
                    slot.label()
                ),
            )
            .hint_opt(slot.hint(level_hint));
            if let Some(first) = matches.first() {
                spec = spec.pos(first.pos);
            }
            out.push(ctx.finding(spec));
        }
    }
}

/// Match one level: `nodes` (the sibling sections at this depth) against the level's
/// grammar. Emits findings, then recurses into declared sections' `children`.
/// `inherited` is the nearest enclosing v2 `description` — the enclosing
/// section's effective hint, `None` at the body root and throughout v1 contracts.
fn match_level(
    nodes: &[SectionNode],
    seq: &SectionSeq,
    inherited: Option<&str>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    let slots = slots_of(&seq.specs);
    let level_hint = seq.description.as_deref().or(inherited);

    check_duplicate_headings(nodes, &slots, level_hint, ctx, out);

    // Assign each section to its declared slot (first occurrence binds the slot).
    let assigned: Vec<Assigned<'_>> = nodes
        .iter()
        .map(|node| Assigned {
            node,
            slot_idx: slot_for(&slots, &node.name),
        })
        .collect();

    check_alias_ambiguity(&assigned, &slots, level_hint, ctx, out);
    check_missing_slots(&assigned, &slots, nodes, level_hint, ctx, out);
    check_repeat_bounds(nodes, &slots, level_hint, ctx, out);
    check_order_and_unknowns(seq, nodes, &slots, &assigned, level_hint, ctx, out);
    run_present_slot_checks(&assigned, &slots, level_hint, ctx, out);
}

/// oneOf / alias ambiguity: a second distinct spelling filling an already-filled
/// multi-name slot → `structure/duplicate-section`.
fn check_alias_ambiguity(
    assigned: &[Assigned<'_>],
    slots: &[Slot<'_>],
    level_hint: Option<&str>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    let mut slot_bound_by: HashMap<usize, &str> = HashMap::new(); // slotIdx → first heading
    for a in assigned {
        let Some(slot_idx) = a.slot_idx else { continue };
        let slot = &slots[slot_idx];
        if slot.repeatable || slot.names.len() <= 1 {
            continue; // single-spelling slots are handled by duplicate-section above
        }
        match slot_bound_by.get(&slot_idx) {
            None => {
                slot_bound_by.insert(slot_idx, &a.node.name);
            }
            Some(&bound) if bound != a.node.name => {
                out.push(ctx.finding(
                    FindingSpec::new(
                        "structure/duplicate-section",
                        format!(
                            "‘{}’ is a second spelling of an alias set already filled by ‘{bound}’; supply exactly one",
                            a.node.name
                        ),
                    )
                    .pos(a.node.pos)
                    .hint_opt(slot.hint(level_hint)),
                ));
            }
            Some(_) => {}
        }
    }
}

/// Required (non-optional) declared slots that no doc section filled →
/// `structure/section-missing`, pinned to the first body heading when one exists.
fn check_missing_slots(
    assigned: &[Assigned<'_>],
    slots: &[Slot<'_>],
    nodes: &[SectionNode],
    level_hint: Option<&str>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    let filled: HashSet<usize> = assigned.iter().filter_map(|a| a.slot_idx).collect();
    for (slot_idx, slot) in slots.iter().enumerate() {
        if slot.optional || filled.contains(&slot_idx) {
            continue;
        }
        let mut spec = FindingSpec::new(
            "structure/section-missing",
            format!("required section ‘{}’ is missing", slot.label()),
        )
        .hint_opt(slot.hint(level_hint));
        // Absence localizes to the document: pin pos to the first body heading when one
        // exists, else omit (an empty body has no line to point at).
        if let Some(first) = nodes.first() {
            spec = spec.pos(first.pos);
        }
        out.push(ctx.finding(spec));
    }
}

/// Ordering + unknown-admission (see the TS `checkOrderAndUnknowns` for the matrix).
fn check_order_and_unknowns(
    seq: &SectionSeq,
    nodes: &[SectionNode],
    slots: &[Slot<'_>],
    assigned: &[Assigned<'_>],
    level_hint: Option<&str>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    let order = seq.opts.order;
    let allow_unknown = seq.opts.allow_unknown;

    match order {
        Order::RecognizedRelative => {
            check_recognized_relative(assigned, slots, level_hint, ctx, out)
        }
        Order::Strict => check_strict(
            nodes,
            &seq.specs,
            slots,
            allow_unknown,
            level_hint,
            ctx,
            out,
        ),
        Order::None => {}
    }

    if order == Order::Strict || allow_unknown {
        return;
    }

    // Unknowns are only legal at a gap; with no gap declared, each unknown is out of place.
    let has_gap = seq
        .specs
        .iter()
        .any(|s| matches!(unwrap(s).0, Spec::Gap(_)));
    if !has_gap {
        emit_stray_unknowns(assigned, level_hint, ctx, out);
    } else {
        // A gap exists but the level is unordered — count all unknowns against the gap.
        check_unordered_gap(assigned, &seq.specs, level_hint, ctx, out);
    }
}

/// One `structure/section-order` per unknown section on a gap-less, unknown-forbidding level.
fn emit_stray_unknowns(
    assigned: &[Assigned<'_>],
    level_hint: Option<&str>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    for a in assigned {
        if a.slot_idx.is_none() {
            out.push(ctx.finding(
                FindingSpec::new(
                    "structure/section-order",
                    format!(
                        "unexpected unknown section ‘{}’; unknown sections are not permitted here",
                        a.node.name
                    ),
                )
                .pos(a.node.pos)
                .hint_opt(level_hint),
            ));
        }
    }
}

/// The kind-gate, anchors, and node-local rules for each declared, present slot.
fn run_present_slot_checks(
    assigned: &[Assigned<'_>],
    slots: &[Slot<'_>],
    level_hint: Option<&str>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    for a in assigned {
        let Some(slot_idx) = a.slot_idx else { continue };
        let slot = &slots[slot_idx];
        if let Some(opts) = slot.opts {
            run_section_checks(a.node, opts, slot.hint(level_hint), ctx, out);
        }
    }
}

/// recognized-relative: recognized sections must keep declared relative order; unknowns
/// interleave freely. A section whose declared index is *less* than the largest index
/// already seen is the out-of-place one.
fn check_recognized_relative(
    assigned: &[Assigned<'_>],
    slots: &[Slot<'_>],
    level_hint: Option<&str>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    let mut max_slot: Option<usize> = None;
    for a in assigned {
        let Some(slot_idx) = a.slot_idx else { continue };
        if max_slot.is_some_and(|m| slot_idx < m) {
            out.push(ctx.finding(
                FindingSpec::new(
                    "structure/section-order",
                    format!(
                        "‘{}’ appears after a later-declared section; recognized sections must keep declared order",
                        a.node.name
                    ),
                )
                .pos(a.node.pos)
                .hint_opt(slots[slot_idx].hint(level_hint)),
            ));
        } else {
            max_slot = Some(slot_idx);
        }
    }
}

/// Does `name` match a section/oneOf slot whose spec index is ≥ `from`?
fn matches_slot_from(slots: &[Slot<'_>], name: &str, from: usize) -> Option<usize> {
    slots
        .iter()
        .find(|s| s.spec_idx >= from && s.admits(name))
        .map(|s| s.spec_idx)
}

/// strict: recognized sections in declared order, contiguous; unknowns admitted only at a
/// `gap()` window. A two-cursor positional walk over (declared specs × doc sections),
/// ported line-for-line from the TS `checkStrict`.
fn check_strict(
    nodes: &[SectionNode],
    specs: &[Spec],
    slots: &[Slot<'_>],
    allow_unknown: bool,
    level_hint: Option<&str>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    // Per-spec gap windows: specIdx → admitted count (BTreeMap iterates in spec order,
    // matching the TS Map's insertion order).
    let mut gap_count: BTreeMap<usize, usize> = specs
        .iter()
        .enumerate()
        .filter(|(_, s)| matches!(unwrap(s).0, Spec::Gap(_)))
        .map(|(i, _)| (i, 0))
        .collect();

    // How many document sections a slot has consumed so far: a repeatable slot stays on
    // the cursor to absorb consecutive matching peers.
    let mut slot_fill: HashMap<usize, usize> = HashMap::new();

    let mut spec_idx = 0usize;
    let mut doc_idx = 0usize;
    while doc_idx < nodes.len() {
        let node = &nodes[doc_idx];

        if spec_idx >= specs.len() {
            // Past the declared sequence — a trailing gap absorbs extras, else an unknown
            // is out of place.
            admit_past_sequence(
                node,
                specs,
                slots,
                allow_unknown,
                level_hint,
                &mut gap_count,
                ctx,
                out,
            );
            doc_idx += 1;
            continue;
        }

        let (inner, _) = unwrap(&specs[spec_idx]);
        if matches!(inner, Spec::Gap(_)) {
            // Does this section anchor a later slot? Then close the gap and re-evaluate.
            if matches_slot_from(slots, &node.name, spec_idx + 1).is_some() {
                spec_idx += 1;
                continue;
            }
            *gap_count.entry(spec_idx).or_insert(0) += 1;
            doc_idx += 1;
            continue;
        }

        // A section/oneOf slot at the cursor.
        let slot = slots
            .iter()
            .find(|s| s.spec_idx == spec_idx)
            .expect("slot at cursor spec");
        if slot.admits(&node.name) {
            *slot_fill.entry(spec_idx).or_insert(0) += 1;
            // A repeatable slot stays on the cursor to consume consecutive matching peers.
            if !slot.repeatable {
                spec_idx += 1;
            }
            doc_idx += 1;
            continue;
        }

        // A repeatable slot that has already consumed ≥1 peer is satisfied — treat it
        // like an optional slot as the walk moves on.
        let repeat_satisfied =
            slot.repeatable && slot_fill.get(&spec_idx).copied().unwrap_or(0) > 0;

        // Doesn't match the cursor slot. If it matches a later slot, it jumped ahead.
        if let Some(later) = matches_slot_from(slots, &node.name, spec_idx + 1) {
            if !slot.optional && !repeat_satisfied {
                out.push(ctx.finding(
                    FindingSpec::new(
                        "structure/section-order",
                        format!(
                            "‘{}’ appears before required section ‘{}’; strict order is violated",
                            node.name,
                            slot.label()
                        ),
                    )
                    .pos(node.pos)
                    .hint_opt(slot.hint(level_hint)),
                ));
            }
            // Advance the cursor to the later slot and consume the section there.
            spec_idx = later + 1;
            doc_idx += 1;
            continue;
        }

        // The cursor slot is optional (or a satisfied repeatable) and unmatched → skip it.
        if slot.optional || repeat_satisfied {
            spec_idx += 1;
            continue;
        }

        // An unknown section sitting on a required slot with no gap here.
        if slot_for(slots, &node.name).is_none() {
            if !allow_unknown {
                out.push(ctx.finding(
                    FindingSpec::new(
                        "structure/section-order",
                        format!(
                            "unexpected section ‘{}’ in the strict prefix; extras are only permitted after a gap",
                            node.name
                        ),
                    )
                    .pos(node.pos)
                    .hint_opt(level_hint),
                ));
            }
            doc_idx += 1;
            continue;
        }

        // A recognized section whose slot is earlier (already consumed/skipped).
        spec_idx += 1;
    }

    emit_gap_counts(&gap_count, specs, slots, nodes, level_hint, ctx, out);
}

/// A doc section encountered past the declared spec sequence: a trailing gap absorbs it;
/// otherwise an unknown is out of place under `allowUnknown: false`.
#[allow(clippy::too_many_arguments)]
fn admit_past_sequence(
    node: &SectionNode,
    specs: &[Spec],
    slots: &[Slot<'_>],
    allow_unknown: bool,
    level_hint: Option<&str>,
    gap_count: &mut BTreeMap<usize, usize>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    let last_was_gap = specs
        .last()
        .is_some_and(|s| matches!(unwrap(s).0, Spec::Gap(_)));
    let known = slot_for(slots, &node.name).is_some();
    if !known && !last_was_gap && !allow_unknown {
        out.push(
            ctx.finding(
                FindingSpec::new(
                    "structure/section-order",
                    format!(
                        "unexpected section ‘{}’ after the declared sequence",
                        node.name
                    ),
                )
                .pos(node.pos)
                .hint_opt(level_hint),
            ),
        );
    } else if !known && last_was_gap {
        *gap_count.entry(specs.len() - 1).or_insert(0) += 1;
    }
}

/// Check each gap window's admitted count against its bounds → `structure/gap-count`.
fn emit_gap_counts(
    gap_count: &BTreeMap<usize, usize>,
    specs: &[Spec],
    slots: &[Slot<'_>],
    nodes: &[SectionNode],
    level_hint: Option<&str>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    for (&gap_spec_idx, &count) in gap_count {
        let Spec::Gap(gap) = unwrap(&specs[gap_spec_idx]).0 else {
            continue;
        };
        if let Some(message) = gap_bound_message(gap, count) {
            let mut spec = FindingSpec::new("structure/gap-count", message)
                .hint_opt(gap.description.as_deref().or(level_hint));
            if let Some(pos) = gap_anchor_pos(slots, nodes, gap_spec_idx) {
                spec = spec.pos(pos);
            }
            out.push(ctx.finding(spec));
        }
    }
}

/// The violation message for a gap window's admitted `count`, or `None` when in bounds.
fn gap_bound_message(gap: &GapSpec, count: usize) -> Option<String> {
    if let Some(min) = gap.min
        && count < min
    {
        return Some(format!(
            "gap admitted {count} unknown sections; expected at least {min}"
        ));
    }
    if let Some(max) = gap.max
        && count > max
    {
        return Some(format!(
            "gap admitted {count} unknown sections; expected at most {max}"
        ));
    }
    None
}

/// Count unknowns against a single gap on an *unordered* level with `allowUnknown: false`.
fn check_unordered_gap(
    assigned: &[Assigned<'_>],
    specs: &[Spec],
    level_hint: Option<&str>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    let Some(gap) = specs.iter().find_map(|s| match unwrap(s).0 {
        Spec::Gap(g) => Some(g),
        _ => None,
    }) else {
        return;
    };
    let count = assigned.iter().filter(|a| a.slot_idx.is_none()).count();
    if let Some(message) = gap_bound_message(gap, count) {
        out.push(
            ctx.finding(
                FindingSpec::new("structure/gap-count", message)
                    .hint_opt(gap.description.as_deref().or(level_hint)),
            ),
        );
    }
}

/// The pos a gap-count finding carries: the first present heading of the slot immediately
/// following the gap, else omitted.
fn gap_anchor_pos(
    slots: &[Slot<'_>],
    nodes: &[SectionNode],
    gap_spec_idx: usize,
) -> Option<crate::finding::SourcePos> {
    let after = slots.iter().find(|s| s.spec_idx > gap_spec_idx)?;
    nodes.iter().find(|n| after.admits(&n.name)).map(|n| n.pos)
}

// ── Per-section checks: kind-gate, anchors, node-local rules, recursion ──────────────

fn run_section_checks(
    node: &SectionNode,
    opts: &SectionOpts,
    section_hint: Option<&str>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    // Anchor presence — a declared `^anchor` must resolve to a block or section anchor.
    if let Some(anchor) = &opts.anchor
        && !anchor_resolves(node, anchor)
    {
        out.push(
            ctx.finding(
                FindingSpec::new(
                    "structure/anchor-missing",
                    format!(
                        "section ‘{}’ is missing required block-id ^{anchor}",
                        node.name
                    ),
                )
                .pos(node.pos)
                .hint_opt(section_hint),
            ),
        );
    }

    // The content kind-gate — a single leaf, or named leaves bound by `^anchor`.
    match &opts.content {
        Some(SectionContent::Single(leaf)) => kind_gate(node, leaf, None, section_hint, ctx, out),
        Some(SectionContent::Anchored(entries)) => {
            for (anchor, leaf) in entries {
                kind_gate(node, leaf, Some(anchor), section_hint, ctx, out);
            }
        }
        None => {}
    }

    // Node-local rules (including section-scoped text constraints) — findings that carry
    // no nearer hint inherit the bound section's effective hint.
    for r in &opts.rules {
        for mut finding in r.run(node, ctx) {
            if finding.hint.is_none() {
                finding.hint = section_hint.map(str::to_string);
            }
            out.push(finding);
        }
    }

    // Recurse into declared children.
    if let Some(children) = &opts.children {
        match_level(&node.sections, children, section_hint, ctx, out);
    }
}

/// Whether an anchor id resolves to a block-bound or section-level anchor in this section.
fn anchor_resolves(node: &SectionNode, id: &str) -> bool {
    node.anchors.iter().any(|a| a == id) || node.blocks.iter().any(|b| b.anchor() == Some(id))
}

/// The kind-gate: a declared content slot must be filled by a block of the expected kind.
/// Data shape (columns / rows / items) is NOT checked here — that is the content plane.
fn kind_gate(
    node: &SectionNode,
    leaf: &LeafSpec,
    anchor: Option<&str>,
    section_hint: Option<&str>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    let expected = leaf.kind;
    let leaf_hint = leaf.description.as_deref().or(section_hint);
    let Some(candidate) = pick_block(node, anchor) else {
        let message = match anchor {
            Some(a) => format!(
                "section ‘{}’ is missing a {expected} block at ^{a}",
                node.name
            ),
            None => format!("section ‘{}’ is missing a {expected} block", node.name),
        };
        out.push(
            ctx.finding(
                FindingSpec::new("structure/block-missing", message)
                    .pos(node.pos)
                    .hint_opt(leaf_hint),
            ),
        );
        return;
    };
    if candidate.kind() != expected {
        out.push(
            ctx.finding(
                FindingSpec::new(
                    "structure/block-kind",
                    format!(
                        "block in section ‘{}’ is a {}; expected a {expected}",
                        node.name,
                        candidate.kind()
                    ),
                )
                .pos(candidate.pos())
                .hint_opt(leaf_hint),
            ),
        );
    }
}

/// The block a content slot addresses: the block carrying `anchor` when set, else the
/// section's first block.
fn pick_block<'a>(node: &'a SectionNode, anchor: Option<&str>) -> Option<&'a BlockNode> {
    match anchor {
        Some(a) => node.blocks.iter().find(|b| b.anchor() == Some(a)),
        None => node.blocks.first(),
    }
}

// ── Public entry ──────────────────────────────────────────────────────────────────────

/// Walk the projection's top-level sections against the body grammar, emitting every
/// `structure/*` finding in emission order; `validate` applies the deterministic sort.
pub fn match_structure(root: &SectionNode, body: &SectionSeq, ctx: &Ctx) -> Vec<Finding> {
    let mut out = Vec::new();
    match_level(&root.sections, body, None, ctx, &mut out);
    out
}

/// Emit `structure/heading-depth-jump` (warn) for a sub-heading nested more than one
/// level below its parent (H2 → H4). Contract-independent: it scans the projected tree,
/// not the grammar. The synthetic root's direct children are not checked (H1-title → H2
/// is the normal step).
pub fn scan_heading_depth_jumps(root: &SectionNode, ctx: &Ctx) -> Vec<Finding> {
    fn walk(parent: &SectionNode, is_root: bool, ctx: &Ctx, out: &mut Vec<Finding>) {
        for child in &parent.sections {
            if !is_root && child.depth > parent.depth + 1 {
                out.push(
                    ctx.finding(
                        FindingSpec::new(
                            "structure/heading-depth-jump",
                            format!(
                                "heading ‘{}’ (H{}) skips a level under ‘{}’ (H{})",
                                child.name, child.depth, parent.name, parent.depth
                            ),
                        )
                        .pos(child.pos),
                    ),
                );
            }
            walk(child, false, ctx, out);
        }
    }
    let mut out = Vec::new();
    walk(root, true, ctx, &mut out);
    out
}

// ── Tests: hand-ported TS validation fixtures (structure cases) ──────────────────────
//
// Each test is one fixture from `packages/ts/markdown-contract/tests/fixtures/validation/`: the same
// contract (built programmatically), the same verbatim markdown, and the fixture's
// pinned `{id, level?, line?}` expectations. The shared corpus harness over the
// `.expected.json` goldens (`tests/corpus.rs`) pins the declarative path; these
// inline ports pin the programmatic builder path.

#[cfg(test)]
mod tests {
    use crate::contract::{
        Contract, LeafSpec, LevelOpts, Order, SectionContent, SectionOpts, Spec, gap, gap_bounds,
        one_of, optional, rule, section, section_with, sections,
    };
    use crate::finding::{Finding, FindingLevel};
    use crate::registry::FindingSpec;
    use crate::validate::validate;

    /// The corpus golden shape: `(id, level, line)` per finding, in engine order.
    fn brief(findings: &[Finding]) -> Vec<(&str, FindingLevel, Option<u32>)> {
        findings
            .iter()
            .map(|f| (f.id.as_str(), f.level, f.pos.map(|p| p.line)))
            .collect()
    }

    fn body(opts: LevelOpts, specs: Vec<Spec>) -> Contract {
        Contract::new().body(sections(opts, specs))
    }

    const ORDERED_OPEN: LevelOpts = LevelOpts {
        order: Order::None,
        allow_unknown: true,
    };

    // v01 — single required section, exact heading text.
    #[test]
    fn v01_single_required_section() {
        let c = body(LevelOpts::default(), vec![section("Overview")]);
        let pass = "## Overview\n\nThis document records the rollout plan for the cache layer. It covers scope,\nsequencing, and the rollback path in plain prose.\n";
        assert_eq!(validate(pass, &c, "notes/rollout.md"), vec![]);
        let fail = "## Summary\n\nThis document records the rollout plan for the cache layer. It covers scope,\nsequencing, and the rollback path in plain prose.\n";
        assert_eq!(
            brief(&validate(fail, &c, "notes/rollout.md")),
            vec![("structure/section-missing", FindingLevel::Error, Some(1))]
        );
    }

    // v01a — required section absent behind an H1 title; pos pins to the first heading.
    #[test]
    fn v01a_required_section_absent() {
        let c = body(ORDERED_OPEN, vec![section("Overview")]);
        let pass = "# Widget notes\n\n## Overview\n\nWidgets are small. This document collects loose notes about them.";
        assert_eq!(validate(pass, &c, "notes/widget.md"), vec![]);
        let fail = "# Widget notes\n\n## Background\n\nWidgets are small. This document collects loose notes about them.";
        assert_eq!(
            brief(&validate(fail, &c, "notes/widget.md")),
            vec![("structure/section-missing", FindingLevel::Error, Some(3))]
        );
    }

    // v02 — several required sections; only the absent one is flagged.
    #[test]
    fn v02_multiple_required_sections() {
        let c = body(
            ORDERED_OPEN,
            vec![section("Title"), section("Overview"), section("Status")],
        );
        let pass = "## Title\n\nAdopt the markdown-contract engine.\n\n## Overview\n\nA generic combinator grammar over a positioned section tree.\n\n## Status\n\nProposed.";
        assert_eq!(validate(pass, &c, "note.md"), vec![]);
        let fail = "## Title\n\nAdopt the markdown-contract engine.\n\n## Status\n\nProposed.";
        assert_eq!(
            brief(&validate(fail, &c, "note.md")),
            vec![("structure/section-missing", FindingLevel::Error, Some(1))]
        );
    }

    // v02a — one of several required missing → exactly one section-missing finding.
    #[test]
    fn v02a_one_of_several_missing() {
        let c = body(
            ORDERED_OPEN,
            vec![section("Title"), section("Overview"), section("Status")],
        );
        let fail = "## Title\n\nA short working title for the note.\n\n## Status\n\nopen/draft";
        let out = validate(fail, &c, "docs/note.md");
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].id, "structure/section-missing");
        assert!(out[0].message.contains("‘Overview’"));
    }

    // v03a — sibling heading repeated → structure/duplicate-section at the repeat.
    #[test]
    fn v03a_duplicate_section_heading() {
        let c = body(
            ORDERED_OPEN,
            vec![section("Title"), optional(section("Overview"))],
        );
        assert_eq!(validate("## Title\n## Overview", &c, "note.md"), vec![]);
        assert_eq!(
            brief(&validate(
                "## Title\n## Overview\n## Overview",
                &c,
                "note.md"
            )),
            vec![("structure/duplicate-section", FindingLevel::Error, Some(3))]
        );
    }

    // v04 — recognized-relative: unknowns interleave freely; a reversed recognized pair fails.
    #[test]
    fn v04_recognized_relative_order() {
        let c = body(
            LevelOpts {
                order: Order::RecognizedRelative,
                allow_unknown: true,
            },
            vec![section("Title"), section("Overview"), section("Status")],
        );
        let pass = "## Title\n\nA short heading section.\n\n## Extra\n\nAn author-added aside the contract never names.\n\n## Overview\n\nWhat this document covers.\n\n## Status\n\nopen";
        assert_eq!(validate(pass, &c, "docs/note.md"), vec![]);
        let fail = "## Overview\n\nWhat this document covers.\n\n## Extra\n\nAn author-added aside the contract never names.\n\n## Title\n\nA short heading section.\n\n## Status\n\nopen";
        assert_eq!(
            brief(&validate(fail, &c, "docs/note.md")),
            vec![("structure/section-order", FindingLevel::Error, Some(9))]
        );
    }

    // v04a — recognized pair reversed; the finding localizes to the Title heading, line 5.
    #[test]
    fn v04a_recognized_relative_out_of_order() {
        let c = body(
            LevelOpts {
                order: Order::RecognizedRelative,
                allow_unknown: true,
            },
            vec![section("Title"), section("Overview"), section("Status")],
        );
        let fail = "## Overview\n\nA note that arrived before its title.\n\n## Title\n\nD-XXXX — some decision.\n\n## Status\n\nopen/proposed";
        assert_eq!(
            brief(&validate(fail, &c, "docs/sample.md")),
            vec![("structure/section-order", FindingLevel::Error, Some(5))]
        );
    }

    // v05 — strict prefix + gap tail: Risks inside the prefix is out of place.
    #[test]
    fn v05_strict_prefix_gap_tail() {
        let c = body(
            LevelOpts {
                order: Order::Strict,
                allow_unknown: false,
            },
            vec![
                section("Title"),
                section("Overview"),
                section("Status"),
                gap(),
                optional(section("Appendix")),
            ],
        );
        let pass = "## Title\n\nQ2 platform review.\n\n## Overview\n\nWhere the platform stands this quarter.\n\n## Status\n\nOn track.\n\n## Risks\n\nCapacity headroom is thin.\n\n## Appendix\n\nSource dashboards.";
        assert_eq!(validate(pass, &c, "status.md"), vec![]);
        let fail = "## Title\n\nQ2 platform review.\n\n## Risks\n\nCapacity headroom is thin.\n\n## Overview\n\nWhere the platform stands this quarter.\n\n## Status\n\nOn track.\n\n## Appendix\n\nSource dashboards.";
        assert_eq!(
            brief(&validate(fail, &c, "status.md")),
            vec![("structure/section-order", FindingLevel::Error, Some(5))]
        );
    }

    // v05a — unknown section inside the strict prefix, verbatim, Risks on line 5.
    #[test]
    fn v05a_unknown_inside_strict_prefix() {
        let c = body(
            LevelOpts {
                order: Order::Strict,
                allow_unknown: false,
            },
            vec![
                section("Title"),
                section("Overview"),
                section("Status"),
                gap(),
                optional(section("Appendix")),
            ],
        );
        let pass = "## Title\n\nThe widget pipeline.\n\n## Overview\n\nWhat the pipeline does and why.\n\n## Status\n\nShipped.";
        assert_eq!(validate(pass, &c, "docs/sample.md"), vec![]);
        let fail = "## Title\n\nThe widget pipeline.\n\n## Risks\n\nThings that could go wrong.\n\n## Overview\n\nWhat the pipeline does and why.\n\n## Status\n\nShipped.";
        assert_eq!(
            brief(&validate(fail, &c, "docs/sample.md")),
            vec![("structure/section-order", FindingLevel::Error, Some(5))]
        );
    }

    // v05b — gap({min: 1, max: 2}) bounds the window: below and above both fail.
    #[test]
    fn v05b_gap_bounds() {
        let c = body(
            LevelOpts {
                order: Order::Strict,
                allow_unknown: false,
            },
            vec![
                section("Summary"),
                section("Highlights"),
                gap_bounds(Some(1), Some(2)),
                section("Sign-off"),
            ],
        );
        let pass = "## Summary\n\nRelease 4.2 ships the new ingest path.\n\n## Highlights\n\nThroughput up 30%.\n\n## Migration notes\n\nRe-run the index build once after upgrading.\n\n## Sign-off\n\nApproved by platform.";
        assert_eq!(validate(pass, &c, "release.md"), vec![]);

        // fail (doc A) — zero extras, below min: 1; the window anchors at Sign-off (line 9).
        let fail_1 = "## Summary\n\nRelease 4.2 ships the new ingest path.\n\n## Highlights\n\nThroughput up 30%.\n\n## Sign-off\n\nApproved by platform.";
        assert_eq!(
            brief(&validate(fail_1, &c, "release.md")),
            vec![("structure/gap-count", FindingLevel::Error, Some(9))]
        );

        // fail (doc B) — three extras, above max: 2.
        let fail_2 = "## Summary\n\nRelease 4.2 ships the new ingest path.\n\n## Highlights\n\nThroughput up 30%.\n\n## Migration notes\n\nRe-run the index build once after upgrading.\n\n## Known issues\n\nA handful of edge cases remain.\n\n## Rollback\n\nRevert the ingest toggle.\n\n## Sign-off\n\nApproved by platform.";
        assert_eq!(
            brief(&validate(fail_2, &c, "release.md")),
            vec![("structure/gap-count", FindingLevel::Error, Some(21))]
        );
    }

    // v06 — alias sets via oneOf: either spelling passes; no spelling → section-missing.
    #[test]
    fn v06_alias_sets_one_of() {
        let c = body(
            ORDERED_OPEN,
            vec![
                one_of(["Goal", "Goal / Problem statement"]),
                optional(section("Notes")),
            ],
        );
        let pass_1 = "## Goal\n\nShip the alias-set matcher so old and new headings both validate.\n\n## Notes\n\nMigrate stragglers to the long spelling once the validator lands.";
        assert_eq!(validate(pass_1, &c, "docs/notes/goal.md"), vec![]);
        let pass_2 = "## Goal / Problem statement\n\nShip the alias-set matcher so old and new headings both validate.";
        assert_eq!(validate(pass_2, &c, "docs/notes/goal.md"), vec![]);
        let fail = "## Aim\n\nShip the alias-set matcher so old and new headings both validate.";
        assert_eq!(
            brief(&validate(fail, &c, "docs/notes/goal.md")),
            vec![("structure/section-missing", FindingLevel::Error, Some(1))]
        );
    }

    // v06a — no member of a required oneOf present → one section-missing for the group.
    #[test]
    fn v06a_one_of_none_present() {
        let c = body(
            ORDERED_OPEN,
            vec![one_of([
                "Goal",
                "Goal / Problem statement",
                "Objective statement",
            ])],
        );
        let pass = "# Task: tidy the widget cache\n\n## Goal / Problem statement\n\nReclaim stale cache entries so the widget index stays under the memory budget.";
        assert_eq!(validate(pass, &c, "tasks/tidy-cache.md"), vec![]);
        let fail = "# Task: tidy the widget cache\n\n## Objective\n\nReclaim stale cache entries so the widget index stays under the memory budget.";
        let out = validate(fail, &c, "tasks/tidy-cache.md");
        assert_eq!(
            brief(&out),
            vec![("structure/section-missing", FindingLevel::Error, Some(3))]
        );
    }

    // v06b — two distinct members of one oneOf set both present → duplicate-section.
    #[test]
    fn v06b_one_of_two_members_present() {
        let c = body(
            LevelOpts {
                order: Order::RecognizedRelative,
                allow_unknown: true,
            },
            vec![one_of(["Goal", "Goal / Problem statement"])],
        );
        assert_eq!(
            validate("## Goal\nShip the validator.", &c, "note.md"),
            vec![]
        );
        let fail = "## Goal\nShip the validator.\n\n## Goal / Problem statement\nAuthors hand-format docs and drift from the house structure.";
        assert_eq!(
            brief(&validate(fail, &c, "note.md")),
            vec![("structure/duplicate-section", FindingLevel::Error, Some(4))]
        );
    }

    // v09b — required ^anchor absent: content leaf fine, only the block-id removed.
    #[test]
    fn v09b_required_anchor_absent() {
        let c = body(
            LevelOpts::default(),
            vec![section_with(
                "Summary",
                SectionOpts {
                    anchor: Some("summary".into()),
                    content: Some(SectionContent::Single(LeafSpec::max_words(120.0))),
                    ..Default::default()
                },
            )],
        );
        let pass = "## Summary\n\nThis decision adopts a generic TypeScript contract library for validating the\nstructure of our markdown documents. Frontmatter stays in Zod; section sequence\nand nesting move to a combinator grammar; content leaves reuse Zod.\n^summary";
        assert_eq!(validate(pass, &c, "docs/README.md"), vec![]);
        let fail = "## Summary\n\nThis decision adopts a generic TypeScript contract library for validating the\nstructure of our markdown documents. Frontmatter stays in Zod; section sequence\nand nesting move to a combinator grammar; content leaves reuse Zod.";
        assert_eq!(
            brief(&validate(fail, &c, "docs/README.md")),
            vec![("structure/anchor-missing", FindingLevel::Error, Some(1))]
        );
    }

    // v14 — nested children: the child grammar is strict; swapped H3s are out of order.
    #[test]
    fn v14_nested_children_subsections() {
        let c = body(
            LevelOpts {
                order: Order::RecognizedRelative,
                allow_unknown: true,
            },
            vec![section_with(
                "Decision",
                SectionOpts {
                    children: Some(sections(
                        LevelOpts {
                            order: Order::Strict,
                            allow_unknown: true,
                        },
                        vec![section("Components"), section("Resolution")],
                    )),
                    ..Default::default()
                },
            )],
        );
        let pass = "## Decision\n\nWe split the engine from the SDLC integration.\n\n### Components\n\nThe generic `markdown-contract` package and the per-entity `contract.ts`.\n\n### Resolution\n\nShip the engine standalone; SDLC consumes it as data.";
        assert_eq!(validate(pass, &c, "decision.md"), vec![]);
        let fail = "## Decision\n\nWe split the engine from the SDLC integration.\n\n### Resolution\n\nShip the engine standalone; SDLC consumes it as data.\n\n### Components\n\nThe generic `markdown-contract` package and the per-entity `contract.ts`.";
        assert_eq!(
            brief(&validate(fail, &c, "decision.md")),
            vec![("structure/section-order", FindingLevel::Error, Some(5))]
        );
    }

    // v14a — an H4 under an H2 skips H3 → structure/heading-depth-jump (warn) at line 5.
    #[test]
    fn v14a_skipped_heading_level() {
        let c = body(
            LevelOpts {
                order: Order::RecognizedRelative,
                allow_unknown: true,
            },
            vec![section_with(
                "Decision",
                SectionOpts {
                    children: Some(sections(
                        LevelOpts {
                            order: Order::Strict,
                            allow_unknown: true,
                        },
                        vec![section_with(
                            "Components",
                            SectionOpts {
                                content: Some(SectionContent::Single(LeafSpec::table())),
                                ..Default::default()
                            },
                        )],
                    )),
                    ..Default::default()
                },
            )],
        );
        let pass = "## Decision\n\nWe adopt the generic contract library.\n\n### Components\n\n| # | Component | Resolution |\n| - | --------- | ---------- |\n| 1 | engine    | markdown-contract |";
        assert_eq!(validate(pass, &c, "docs/README.md"), vec![]);
        let fail = "## Decision\n\nWe adopt the generic contract library.\n\n#### Components\n\n| # | Component | Resolution |\n| - | --------- | ---------- |\n| 1 | engine    | markdown-contract |";
        assert_eq!(
            brief(&validate(fail, &c, "docs/README.md")),
            vec![("structure/heading-depth-jump", FindingLevel::Warn, Some(5))]
        );
    }

    // v17 — node-level custom rule: Summary must mention "outcome"; fires at the heading.
    #[test]
    fn v17_node_level_custom_rule() {
        let build = || {
            body(
                LevelOpts {
                    order: Order::RecognizedRelative,
                    allow_unknown: true,
                },
                vec![section_with(
                    "Summary",
                    SectionOpts {
                        rules: vec![rule("summary/mentions-outcome", |node, ctx| {
                            let text = node
                                .blocks
                                .iter()
                                .filter_map(|b| match b {
                                    crate::tree::BlockNode::Paragraph { text, .. } => {
                                        Some(text.as_str())
                                    }
                                    _ => None,
                                })
                                .collect::<Vec<_>>()
                                .join(" ")
                                .to_lowercase();
                            if text.contains("outcome") {
                                vec![]
                            } else {
                                vec![
                                    ctx.finding(
                                        FindingSpec::new(
                                            "summary/mentions-outcome",
                                            "Summary must mention the decision outcome",
                                        )
                                        .level(FindingLevel::Error)
                                        .pos(node.pos),
                                    ),
                                ]
                            }
                        })],
                        ..Default::default()
                    },
                )],
            )
        };
        let pass = "## Summary\n\nThis decision adopts a combinator grammar over flat schema lists. The outcome is a single\nvalidation pass that localizes findings to source lines.";
        assert_eq!(validate(pass, &build(), "docs/doc.md"), vec![]);
        let fail = "## Summary\n\nThis decision adopts a combinator grammar over flat schema lists. It runs in a single\nvalidation pass that localizes findings to source lines.";
        assert_eq!(
            brief(&validate(fail, &build(), "docs/doc.md")),
            vec![("summary/mentions-outcome", FindingLevel::Error, Some(1))]
        );
    }

    // ── Beyond the ported fixtures: the remaining structure ids ─────────────────────

    #[test]
    fn key_collision_when_two_headings_share_a_camel_key() {
        let c = body(ORDERED_OPEN, vec![section("Files to touch")]);
        let fail = "## Files to touch\n\na\n\n## Files To Touch\n\nb\n";
        assert_eq!(
            brief(&validate(fail, &c, "note.md")),
            vec![("structure/key-collision", FindingLevel::Error, Some(5))]
        );
    }

    #[test]
    fn kind_gate_block_missing_and_block_kind() {
        let c = body(
            ORDERED_OPEN,
            vec![section_with(
                "Components",
                SectionOpts {
                    content: Some(SectionContent::Single(LeafSpec::table())),
                    ..Default::default()
                },
            )],
        );
        // No block at all → block-missing at the heading.
        assert_eq!(
            brief(&validate("## Components\n", &c, "d.md")),
            vec![("structure/block-missing", FindingLevel::Error, Some(1))]
        );
        // A paragraph where a table is declared → block-kind at the block.
        let out = validate("## Components\n\nJust prose.\n", &c, "d.md");
        assert_eq!(
            brief(&out),
            vec![("structure/block-kind", FindingLevel::Error, Some(3))]
        );
        assert_eq!(
            out[0].message,
            "block in section ‘Components’ is a paragraph; expected a table"
        );
    }

    #[test]
    fn repeatable_slot_admits_peers_and_enforces_bounds() {
        let repeatable = |min, max| {
            body(
                LevelOpts {
                    order: Order::None,
                    allow_unknown: true,
                },
                vec![section_with(
                    "Entry",
                    SectionOpts {
                        repeatable: true,
                        min,
                        max,
                        ..Default::default()
                    },
                )],
            )
        };
        // Peers are the collection the slot admits — no duplicate-section.
        assert_eq!(
            validate(
                "## Entry\n\na\n\n## Entry\n\nb\n",
                &repeatable(None, None),
                "r.md"
            ),
            vec![]
        );
        // max: 1 bites at the first surplus occurrence (line 5).
        assert_eq!(
            brief(&validate(
                "## Entry\n\na\n\n## Entry\n\nb\n",
                &repeatable(None, Some(1)),
                "r.md"
            )),
            vec![("structure/repeat-count", FindingLevel::Error, Some(5))]
        );
        // min: 3 bites once present, pinned to the first occurrence.
        assert_eq!(
            brief(&validate(
                "## Entry\n\na\n\n## Entry\n\nb\n",
                &repeatable(Some(3), None),
                "r.md"
            )),
            vec![("structure/repeat-count", FindingLevel::Error, Some(1))]
        );
        // Absent entirely: absence is section-missing, not a count.
        assert_eq!(
            brief(&validate(
                "## Other\n\nx\n",
                &repeatable(Some(1), None),
                "r.md"
            )),
            vec![("structure/section-missing", FindingLevel::Error, Some(1))]
        );
    }

    #[test]
    fn stray_unknown_on_gapless_unordered_level_forbidding_unknowns() {
        let c = body(
            LevelOpts {
                order: Order::None,
                allow_unknown: false,
            },
            vec![section("Overview")],
        );
        let fail = "## Overview\n\nok\n\n## Surprise\n\nnot declared\n";
        assert_eq!(
            brief(&validate(fail, &c, "note.md")),
            vec![("structure/section-order", FindingLevel::Error, Some(5))]
        );
    }
}
