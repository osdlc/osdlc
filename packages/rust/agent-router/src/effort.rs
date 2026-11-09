//! The effort-mismatch policy (mirror of `effort.ts`): an effort the tool and
//! model do not accept moves at most one step on the effort scale, up first.

use serde::{Deserialize, Serialize};

/// `EFFORT_LEVELS` from `@osdlc/agent-call/models`, least to most reasoning.
pub const EFFORT_LEVELS: &[&str] = &["none", "minimal", "low", "medium", "high", "xhigh", "max"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Direction {
    Up,
    Down,
}

/// How a resolve moved an effort the tool and model do not accept.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EffortAdjustment {
    /// The effort the reference asked for.
    pub requested: String,
    pub direction: Direction,
    /// The effort the resolve used.
    pub used: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AdjustedEffort {
    pub effort: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub adjusted: Option<EffortAdjustment>,
}

/// The effort to run with when `effort` is asked for and `supported` are the
/// accepted levels: `effort` itself when supported, else the next level up when
/// supported, else the next level down. `None` when neither neighbour is
/// supported, or `effort` is not on the scale.
pub fn adjust_effort<S: AsRef<str>>(effort: &str, supported: &[S]) -> Option<AdjustedEffort> {
    let has = |e: &str| supported.iter().any(|s| s.as_ref() == e);
    if has(effort) {
        return Some(AdjustedEffort {
            effort: effort.to_string(),
            adjusted: None,
        });
    }
    let at = EFFORT_LEVELS.iter().position(|l| *l == effort)?;
    let step = |used: &str, direction| AdjustedEffort {
        effort: used.to_string(),
        adjusted: Some(EffortAdjustment {
            requested: effort.to_string(),
            direction,
            used: used.to_string(),
        }),
    };
    if let Some(up) = EFFORT_LEVELS.get(at + 1)
        && has(up)
    {
        return Some(step(up, Direction::Up));
    }
    if at > 0 && has(EFFORT_LEVELS[at - 1]) {
        return Some(step(EFFORT_LEVELS[at - 1], Direction::Down));
    }
    None
}

/// The line a trace and a warning carry for an adjusted effort.
pub fn effort_adjusted_message(adjusted: &EffortAdjustment) -> String {
    let direction = match adjusted.direction {
        Direction::Up => "up",
        Direction::Down => "down",
    };
    format!(
        "effort '{}' is not supported; using '{}', one step {direction}",
        adjusted.requested, adjusted.used
    )
}
