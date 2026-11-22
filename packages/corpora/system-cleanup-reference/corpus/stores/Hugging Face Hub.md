---
slug: huggingface-hub
category: model-hub
vendor: Hugging Face
homepage: https://huggingface.co
docs: https://huggingface.co/docs/huggingface_hub
repository: https://github.com/huggingface/huggingface_hub
license: Apache-2.0
open_source: true
platforms:
- macos
- linux
- windows
cli: hf
checked: '2026-11-21'
sources:
- '[Environment variables 3](../documents/Hugging%20Face/Environment%20variables%203.md)'
- '[Understand caching](../documents/Hugging%20Face/Understand%20caching.md)'
- '[Command Line Interface (CLI) 2](../documents/Hugging%20Face/Command%20Line%20Interface%20%28CLI%29%202.md)'
- '[file_download.py](../documents/Hugging%20Face/file_download.py.md)'
---

huggingface_hub is the Python library and `hf` CLI that download models, datasets and spaces from the Hugging Face Hub into a shared cache used by transformers, diffusers, llama.cpp and others. The hub cache keeps every downloaded revision and is often the largest model store on a machine.
