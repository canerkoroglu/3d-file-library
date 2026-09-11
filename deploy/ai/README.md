# Modelist AI backend (GPU, Docker)

A GPU-accelerated, OpenAI-compatible LLM server for Modelist's AI assistant, using
[Ollama](https://ollama.com). One container serves **both** the chat model (descriptions,
tags, plain-language search) and the **embedding** model (the "Similar models" feature).

Sized for an **NVIDIA RTX 4080 Super (16 GB)** — an 8B chat model plus the embedder use well
under half the VRAM, so you have room to go bigger.

## Prerequisites (on the machine with the GPU)

1. **NVIDIA driver** (`nvidia-smi` should work).
2. **Docker** + **Docker Compose v2**.
3. **NVIDIA Container Toolkit** so containers can see the GPU:
   ```bash
   # Ubuntu/Debian
   sudo apt-get install -y nvidia-container-toolkit
   sudo nvidia-ctk runtime configure --runtime=docker
   sudo systemctl restart docker
   ```
   Verify the GPU is visible inside a container:
   ```bash
   docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi
   ```

## Run

```bash
cd deploy/ai
cp .env.example .env        # optional — edit models/port
docker compose up -d        # starts the server; model-puller downloads the models
docker compose logs -f model-puller   # watch the (first-time) model download
```

The first run downloads the models into the `ollama-models` volume (a few GB); later starts are
instant. Confirm it's serving and using the GPU:

```bash
curl http://localhost:11434/v1/models          # lists qwen3:8b and nomic-embed-text
docker exec modelist-ollama nvidia-smi         # model resident in VRAM after a request
```

## Point Modelist at it

Settings → **AI assistant**:

| Field | Value |
|---|---|
| Server / Base URL | `http://<gpu-host>:11434/v1` (use the **Ollama** preset if it's the same machine) |
| Model | `qwen3:8b` |
| Embedding model | `nomic-embed-text` |

Then **Enabled** → **Test connection**. Modelist auto-detects Ollama and uses its native
`think:false` route. For "Similar models", click **Build semantic index** once.

> Note: this is **Ollama**, not the LM Studio behind your `openai.caner.in`. Model names differ
> from LM Studio's (`google/gemma-4-e4b` → use `gemma3:12b`/`qwen3:8b`;
> `text-embedding-nomic-embed-text-v1.5` → `nomic-embed-text`).

## Bigger models (16 GB headroom)

Edit `.env` (`CHAT_MODEL=…`), then `docker compose up -d` and re-pull:

| Model | ~VRAM (Q4) | Notes |
|---|---|---|
| `qwen3:8b` | ~5 GB | default; fast, supports think:false |
| `gemma3:12b` | ~8 GB | strong general model |
| `qwen3:14b` | ~9 GB | more capable, still fits with the embedder |

`OLLAMA_KEEP_ALIVE=24h` keeps the model warm in VRAM (drop it if you'd rather free VRAM when idle).

## Exposing it beyond localhost

The server has **no authentication**. Keep it on a trusted LAN/VPN, or (like your
`openai.caner.in`) put a reverse proxy in front for TLS + auth — e.g. Caddy:

```
llm.example.com {
    reverse_proxy localhost:11434
    basic_auth { youruser <bcrypt-hash> }
}
```

Then set Modelist's Base URL to `https://llm.example.com/v1` and the API key to your credentials.

## Alternatives

Ollama is the simplest match for Modelist. If you need higher throughput or exact HF model ids,
**vLLM** or **LocalAI** are OpenAI-compatible too — Modelist will drive them through the generic
OpenAI path (no `think:false`), so keep the response-timeout generous for reasoning models.
