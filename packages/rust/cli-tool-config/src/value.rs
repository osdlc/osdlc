//! Read a setting out of a hydrated config by dotted key, and decide whether
//! what is there counts as set.

/// The value at `key` (`lease_authority`, `paths.dev`) in `obj`, or `None`.
///
/// Each `.`-separated segment walks one level deeper through nested
/// mappings; hitting a non-mapping value, or a missing key, at any segment
/// yields `None`.
///
/// **Stability:** stable in 0.x.
pub fn value_at<'a>(obj: &'a serde_yaml::Value, key: &str) -> Option<&'a serde_yaml::Value> {
    let mut cur = obj;
    for seg in key.split('.') {
        cur = cur.get(seg)?;
    }
    Some(cur)
}

/// Whether a value counts as set: not missing, null, an empty string, an
/// empty sequence or an empty mapping. A schema default that is empty
/// (`repos: []`, `paths: {}`) is therefore "unset", which is what a need
/// means by it.
///
/// `false` and `0` are set — a present-but-falsy scalar still counts.
///
/// **Stability:** stable in 0.x.
pub fn value_is_set(value: Option<&serde_yaml::Value>) -> bool {
    match value {
        None => false,
        Some(serde_yaml::Value::Null) => false,
        Some(serde_yaml::Value::String(s)) => !s.trim().is_empty(),
        Some(serde_yaml::Value::Sequence(seq)) => !seq.is_empty(),
        Some(serde_yaml::Value::Mapping(map)) => !map.is_empty(),
        Some(serde_yaml::Value::Tagged(tagged)) => value_is_set(Some(&tagged.value)),
        Some(serde_yaml::Value::Bool(_)) | Some(serde_yaml::Value::Number(_)) => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_yaml::Value;

    fn config() -> Value {
        serde_yaml::from_str(
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
            assert!(!value_is_set(Some(&Value::Sequence(vec![]))));
            assert!(!value_is_set(Some(&Value::Mapping(
                serde_yaml::Mapping::new()
            ))));
        }

        #[test]
        fn a_non_empty_string_list_or_map_is_set() {
            assert!(value_is_set(Some(&Value::String("x".to_string()))));
            assert!(value_is_set(Some(&Value::Sequence(vec![Value::String(
                "a".to_string()
            )]))));
            let mut map = serde_yaml::Mapping::new();
            map.insert(Value::String("a".to_string()), Value::from(1));
            assert!(value_is_set(Some(&Value::Mapping(map))));
        }

        #[test]
        fn false_and_zero_are_set() {
            assert!(value_is_set(Some(&Value::Bool(false))));
            assert!(value_is_set(Some(&Value::from(0))));
        }
    }
}
