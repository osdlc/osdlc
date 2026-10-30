//! L0 — segment-sequence product and reachability.
//!
//! Each segment-pattern compiles to a sequence NFA: a literal/glob segment
//! consumes exactly one input segment subject to its matcher; `**` consumes
//! zero-or-more segments (an epsilon skip plus a self-loop), honoring
//! `globstar_matches_zero`. [`search`] runs the synchronized product of two such
//! NFAs — advancing both on the same input segment only where their matchers
//! share a concrete string — and BFS-reaches a joint accepting state. Product
//! states expand lazily; predecessors are recorded so one witness path is
//! reconstructed on success.

use std::collections::{HashMap, HashSet, VecDeque};

use super::automaton::{SegmentMatcher, SyntaxState, common_segment, compile_segment};
use crate::{Error, Options};

/// An edge that eats one input segment matching `matcher` (an index into the
/// NFA's matcher arena — `**`'s two edges deliberately share one matcher).
#[derive(Debug, Clone, Copy)]
struct ConsumeEdge {
    matcher: usize,
    to: usize,
}

/// A pattern as a sequence NFA over path segments. `eps` are free moves;
/// `consume` edges eat one input segment matching their matcher; `accept[s]`
/// marks an accepting state.
struct SeqNfa {
    eps: Vec<Vec<usize>>,
    consume: Vec<Vec<ConsumeEdge>>,
    accept: Vec<bool>,
    start: usize,
    matchers: Vec<SegmentMatcher>,
}

impl SeqNfa {
    fn build(pattern: &[&str], opts: &Options) -> Result<Self, Error> {
        let mut eps: Vec<Vec<usize>> = Vec::new();
        let mut consume: Vec<Vec<ConsumeEdge>> = Vec::new();
        let mut accept: Vec<bool> = Vec::new();
        let new_state = |eps: &mut Vec<Vec<usize>>,
                         consume: &mut Vec<Vec<ConsumeEdge>>,
                         accept: &mut Vec<bool>| {
            eps.push(Vec::new());
            consume.push(Vec::new());
            accept.push(false);
            eps.len() - 1
        };

        let n = pattern.len();
        let mut pos: Vec<usize> = Vec::with_capacity(n + 1);
        for _ in 0..=n {
            pos.push(new_state(&mut eps, &mut consume, &mut accept));
        }
        accept[pos[n]] = true;

        // The synthetic matcher for what a `*` / `**` step consumes: one whole
        // segment. Compiled once and shared by every globstar edge.
        let mut state = SyntaxState::new(String::new());
        let mut matchers = vec![compile_segment("*", opts, &mut state)?];
        let star = 0usize;
        let mut state = SyntaxState::new(pattern.join("/"));

        for (i, seg) in pattern.iter().enumerate() {
            let from = pos[i];
            let to = pos[i + 1];
            if *seg == "**" {
                if opts.globstar_matches_zero {
                    eps[from].push(to); // span zero segments
                    consume[from].push(ConsumeEdge {
                        matcher: star,
                        to: from,
                    }); // one-or-more via self-loop
                } else {
                    // Must span at least one segment: consume one, then
                    // zero-or-more, then leave.
                    let mid = new_state(&mut eps, &mut consume, &mut accept);
                    consume[from].push(ConsumeEdge {
                        matcher: star,
                        to: mid,
                    });
                    consume[mid].push(ConsumeEdge {
                        matcher: star,
                        to: mid,
                    });
                    eps[mid].push(to);
                }
            } else {
                matchers.push(compile_segment(seg, opts, &mut state)?);
                consume[from].push(ConsumeEdge {
                    matcher: matchers.len() - 1,
                    to,
                });
            }
        }

        Ok(Self {
            eps,
            consume,
            accept,
            start: pos[0],
            matchers,
        })
    }

    /// Epsilon closure of `from`, in the peer's stack-walk insertion order.
    fn closure(&self, from: usize) -> Vec<usize> {
        let mut set = Vec::new();
        let mut seen = HashSet::new();
        let mut stack = vec![from];
        while let Some(s) = stack.pop() {
            if !seen.insert(s) {
                continue;
            }
            set.push(s);
            for &t in &self.eps[s] {
                stack.push(t);
            }
        }
        set
    }

    fn any_accept(&self, states: &[usize]) -> bool {
        states.iter().any(|&s| self.accept[s])
    }
}

/// One concrete segment path that matches BOTH patterns, or `None` when they are
/// disjoint.
///
/// This is the shared engine behind `intersects` (is it non-`None`?) and
/// `witness` (return it). BFS finds the fewest-segments common path.
///
/// With `spellable`, a path of more than one segment whose last segment is empty
/// does not count: no path string spells it. The search goes on past such a
/// path, so the result is the fewest-segments path that CAN be spelled. The
/// product state then carries a flag for "the last segment was empty", because
/// the same pair of NFA states is accepting or not depending on it.
///
/// # Errors
///
/// [`Error::PatternTooDeep`] or [`Error::UnsupportedSyntax`] from either
/// pattern, before any search.
pub(crate) fn search(
    a: &[&str],
    b: &[&str],
    opts: &Options,
    spellable: bool,
) -> Result<Option<Vec<String>>, Error> {
    let nfa_a = SeqNfa::build(a, opts)?;
    let nfa_b = SeqNfa::build(b, opts)?;
    let width = nfa_b.eps.len();
    // A product state packs (state of A, state of B, last segment empty).
    let key = |sa: usize, sb: usize, empty_last: usize| (sa * width + sb) * 2 + empty_last;
    let start = key(nfa_a.start, nfa_b.start, 0);
    let mut visited: HashSet<usize> = HashSet::from([start]);
    let mut queue: VecDeque<usize> = VecDeque::from([start]);
    let mut pred: HashMap<usize, (usize, String)> = HashMap::new();

    while let Some(st) = queue.pop_front() {
        let empty_last = st % 2;
        let sa = st / 2 / width;
        let sb = st / 2 % width;
        let ca = nfa_a.closure(sa);
        let cb = nfa_b.closure(sb);

        if nfa_a.any_accept(&ca) && nfa_b.any_accept(&cb) {
            let mut segs: Vec<String> = Vec::new();
            let mut cur = st;
            while cur != start {
                let Some((prev, seg)) = pred.get(&cur) else {
                    break;
                };
                segs.push(seg.clone());
                cur = *prev;
            }
            // Skip a path that ends in an empty segment (only when it has others).
            if !(spellable && empty_last == 1 && segs.len() > 1) {
                segs.reverse();
                return Ok(Some(segs));
            }
        }

        for &ua in &ca {
            for ea in &nfa_a.consume[ua] {
                for &ub in &cb {
                    for eb in &nfa_b.consume[ub] {
                        let Some(seg) = common_segment(
                            &nfa_a.matchers[ea.matcher],
                            &nfa_b.matchers[eb.matcher],
                            opts,
                        ) else {
                            continue;
                        };
                        let nk = key(ea.to, eb.to, usize::from(spellable && seg.is_empty()));
                        if visited.insert(nk) {
                            pred.insert(nk, (st, seg));
                            queue.push_back(nk);
                        }
                    }
                }
            }
        }
    }
    Ok(None)
}
