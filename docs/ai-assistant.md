# AI assistant

The AI assistant is optional. When you connect it to a language model, MeshVault can:

- **Describe** each model — a clean name, a one-sentence summary, a category, 3–8 search keywords
  (in English and, when the file name is in another language such as Turkish, in that language too)
  and suggestions from your existing tags. All of it becomes searchable.
- **Search in plain words** — "small printed dragons from last month" becomes
  a search such as `dragon tag:printed added:>1m`, shown to you so you can adjust it.
- **Suggest similar models** — with an embedding model, the viewer lists models that are similar in
  meaning.

MeshVault does not include a model or an account. It talks to a server **you** choose, using the
OpenAI-compatible API that most local and hosted servers offer. Nothing is sent anywhere else.

## Choose a server

| Option | Good for | Base URL |
| --- | --- | --- |
| [Ollama](https://ollama.com) on this computer | Simplest local setup | `http://localhost:11434/v1` |
| [LM Studio](https://lmstudio.ai) on this computer | Local, with a graphical model browser | `http://localhost:1234/v1` |
| llama.cpp server on this computer | Minimal local server | `http://localhost:8080/v1` |
| A GPU server on your network | Bigger models, several users | e.g. `https://llm.example.com/v1` — see [deploy/ai](../deploy/ai/README.md) |
| A hosted OpenAI-compatible service | No local hardware | the provider's `/v1` URL and an API key |

**Model suggestions.** For describing models, a small instruction-tuned model works well:
`qwen3:8b` (the default), `gemma` family models, or similar 4–14B models. For similar-model search,
an embedding model such as `nomic-embed-text`.

With Ollama, for example:

```bash
ollama pull qwen3:8b
ollama pull nomic-embed-text
```

## Connect

**Settings → AI assistant**

1. Turn on **Use a language model**.
2. Pick your server under **Server**, or choose **Custom / remote server…** and enter a **Base URL**
   ending in `/v1`.
3. Enter the **Model** name as the server knows it (e.g. `qwen3:8b`), and an **API key** if the server
   needs one.
4. Optionally enter an **Embedding model** (e.g. `nomic-embed-text`).
5. Press **Test connection**. MeshVault lists the models the server offers and picks one if the name
   you typed is not available.

**Response timeout** controls how long MeshVault waits for an answer. Raise it for large remote
models — a 27B model can take more than a minute per file.

## Use it

| What | Where |
| --- | --- |
| Describe one model | Viewer → **AI** → **Analyse** (or **Analyse again**) |
| Describe a selection | Select models → action bar → **Analyse with AI** |
| Describe everything not yet described | Settings → AI assistant → **Analyse models without a description** |
| Describe new imports automatically | Settings → AI assistant → **Analyse new models automatically as they are imported** |
| Ask in plain words | ✨ button in the search box |
| Apply suggested tags | Viewer → **AI** → **Apply** next to the suggested tags |
| Similar models | Settings → AI assistant → **Build semantic index**, then open any model |

Progress of a running analysis is shown in the sidebar, where you can also stop it. Click a category
or keyword in the viewer to search for it; search by category with `category:"kitchen"`.

The semantic index works on file names alone, but it is much better after the library has been
described, because the descriptions are what it compares.

## How it behaves

- **Ollama** is detected automatically and used through its native API, with the model's "thinking"
  turned off — reasoning models otherwise spend their whole answer budget thinking. Other servers are
  asked to disable thinking too (`enable_thinking: false`); if yours cannot, choose a non-reasoning
  model.
- A dropped connection is retried once before reporting an error.
- Suggested tags are only ever chosen from tags you already have, and are applied only when you click
  **Apply**. Categories come from a fixed list.

## Privacy and security

- What is sent: the file name, folder name, file type, size and triangle count, title/designer/description
  from 3MF projects, the source site, up to ~900 characters of the README, and your tag names.
  **Model files themselves are never sent.**
- Requests go only to the server you configured.
- The API key is encrypted with your operating system's key store and is only ever sent to the server
  address saved with it.
- Downloaded READMEs may contain text written to manipulate AI models. MeshVault marks file details as
  untrusted data in its instructions to the model and validates every reply (fixed category list,
  existing tags only, length limits), so the worst a malicious README can do is produce a poor
  description.

## Troubleshooting

| Problem | Try |
| --- | --- |
| *Test connection* fails | Is the server running? Open the base URL + `/models` in a browser. Check the URL ends in `/v1`. |
| Model not found | Use the exact name from *Test connection*'s list (with Ollama: `ollama list`). |
| Answers time out | Raise **Response timeout**, or use a smaller model. |
| Empty or odd descriptions | Use an instruction-tuned, non-reasoning model; very small models (<3B) are unreliable. |
| *Build semantic index* is disabled | Enter an **Embedding model** and pull it on the server first. |

Details of every failed request are in the log (Settings → About → **Open log folder**).
