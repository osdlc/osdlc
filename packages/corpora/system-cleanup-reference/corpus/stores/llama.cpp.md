---
slug: llama-cpp
category: model-runtime
vendor: ggml-org
homepage: https://github.com/ggml-org/llama.cpp
docs: https://github.com/ggml-org/llama.cpp/tree/master/docs
repository: https://github.com/ggml-org/llama.cpp
license: MIT
open_source: true
platforms:
- macos
- linux
- windows
cli: llama
checked: '2026-11-21'
sources:
- '[common hf-cache.cpp](../documents/ggml-org/common%20hf-cache.cpp.md)'
- '[common common.cpp](../documents/ggml-org/common%20common.cpp.md)'
- '[llama.cpp RPC](../documents/ggml-org/llama.cpp%20RPC.md)'
- '[LLaMA.cpp HTTP Server](../documents/ggml-org/LLaMA.cpp%20HTTP%20Server.md)'
- '[llama.cpp tools completion](../documents/ggml-org/llama.cpp%20tools%20completion.md)'
- '[file_download.py](../documents/Hugging%20Face/file_download.py.md)'
- '[tools server server-models.cpp](../documents/ggml-org/tools%20server%20server-models.cpp.md)'
- '[llama.cpp README](../documents/ggml-org/llama.cpp%20README.md)'
---

llama.cpp is a C/C++ LLM inference engine whose tools (llama cli, llama serve / llama-server) can download GGUF models with -hf. Those downloads now go into the Hugging Face hub cache layout (shared with huggingface_hub), while a separate llama.cpp cache directory holds Docker-model downloads and the RPC tensor cache.
