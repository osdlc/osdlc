//! Read a setting from a loaded config by dotted key, and decide whether the
//! value counts as set.
//!
//! A loaded config is a [`serde_json::Value`]: the generic tree of maps,
//! lists, strings, numbers, booleans and null that a YAML file reads into.

use serde_json::{Map, Value};

/// The value at `key` (`lease_authority`, `paths.dev`) in `obj`, or `None`.
///
/// Each `.`-separated segment walks one level deeper through nested
/// mappings. A non-mapping value or a missing key at any segment gives
/// `None`. A key that itself contains a `.` cannot be reached.
///
/// **Stability:** stable in 0.x.
pub fn value_at<'a>(obj: &'a Value, key: &str) -> Option<&'a Value> {
    let mut cur = obj;
    for seg in key.split('.') {
        cur = cur.get(seg)?;
    }
    Some(cur)
}

/// [`value_at`] in a mapping held mutably, for an edit in place. The same
/// walk: mappings only, so a list index or a `.` inside a key is never
/// reached.
pub(crate) fn value_at_mut<'a>(
    map: &'a mut Map<String, Value>,
    key: &str,
) -> Option<&'a mut Value> {
    let mut segments = key.split('.');
    let mut cur = map.get_mut(segments.next()?)?;
    for seg in segments {
        cur = cur.get_mut(seg)?;
    }
    Some(cur)
}

/// Whether a value counts as set: not missing, null, an empty or
/// whitespace-only string, an empty sequence or an empty mapping. A schema
/// default that is empty (`repos: []`, `paths: {}`) is therefore "unset",
/// which is what a need means by it.
///
/// `false` and `0` are set: a scalar that is present counts, even when falsy.
///
/// **Stability:** stable in 0.x.
pub fn value_is_set(value: Option<&Value>) -> bool {
    match value {
        None => false,
        Some(Value::Null) => false,
        Some(Value::String(s)) => !s.trim().is_empty(),
        Some(Value::Array(items)) => !items.is_empty(),
        Some(Value::Object(map)) => !map.is_empty(),
        Some(Value::Bool(_)) | Some(Value::Number(_)) => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Map;

    fn config() -> Value {
        serde_saphyr::from_str(
            r#"
authority: origin
paths:
  dev: /d
checkout:
  layout: "{dev}/{repo}"
"#,
        )
        .unwrap()
    }

    mod value_at_tests {
        use super::*;

        #[test]
        fn walks_a_dotted_key() {
            let cfg = config();
            assert_eq!(
                value_at(&cfg, "authority"),
                Some(&Value::String("origin".to_string()))
            );
            assert_eq!(
                value_at(&cfg, "paths.dev"),
                Some(&Value::String("/d".to_string()))
            );
            assert_eq!(
                value_at(&cfg, "checkout.layout"),
                Some(&Value::String("{dev}/{repo}".to_string()))
            );
            assert_eq!(value_at(&cfg, "nope.deeper"), None);
        }

        #[test]
        fn the_mutable_walk_reaches_what_the_shared_one_does() {
            let Value::Object(mut map) = config() else {
                panic!("the config is a mapping")
            };
            for key in [
                "authority",
                "paths.dev",
                "checkout.layout",
                "nope.deeper",
                "paths.dev.x",
            ] {
                let shared = value_at(&Value::Object(map.clone()), key).cloned();
                assert_eq!(value_at_mut(&mut map, key).cloned(), shared, "{key}");
            }
            if let Some(v) = value_at_mut(&mut map, "paths.dev") {
                *v = Value::String("/e".to_string());
            }
            assert_eq!(map["paths"]["dev"], Value::String("/e".to_string()));
        }

        #[test]
        fn a_non_mapping_root_yields_none() {
            assert_eq!(value_at(&Value::Null, "a"), None);
            assert_eq!(value_at(&Value::String("str".to_string()), "length"), None);
        }
    }

    mod value_is_set_tests {
        use super::*;

        #[test]
        fn missing_null_empty_string_empty_list_and_empty_map_are_unset() {
            assert!(!value_is_set(None));
            assert!(!value_is_set(Some(&Value::Null)));
            assert!(!value_is_set(Some(&Value::String(String::new()))));
            assert!(!value_is_set(Some(&Value::String("  ".to_string()))));
            assert!(!value_is_set(Some(&Value::Array(vec![]))));
            assert!(!value_is_set(Some(&Value::Object(Map::new()))));
        }

        #[test]
        fn a_non_empty_string_list_or_map_is_set() {
            assert!(value_is_set(Some(&Value::String("x".to_string()))));
            assert!(value_is_set(Some(&Value::Array(vec![Value::String(
                "a".to_string()
            )]))));
            let mut map = Map::new();
            map.insert("a".to_string(), Value::from(1));
            assert!(value_is_set(Some(&Value::Object(map))));
        }

        #[test]
        fn false_and_zero_are_set() {
            assert!(value_is_set(Some(&Value::Bool(false))));
            assert!(value_is_set(Some(&Value::from(0))));
        }
    }
}
