# n8n-nodes-edenai

This is an n8n community node for [Eden AI](https://www.edenai.run) — a European AI gateway that gives you access to 300+ models from 50+ providers through a single API and credential.

## Features

- **300+ models** from providers like OpenAI, Anthropic, Mistral, Google, and more
- **Automatic fallback** — define backup models if the primary fails
- **Web search** — enable real-time web access for supported models
- **European hosting** — full transparency on where models are hosted, GDPR-compliant

## Installation

In your n8n instance, go to **Settings → Community Nodes** and install:

```
n8n-nodes-edenai
```

## Credentials

You need an Eden AI API key. Get one at [app.edenai.run](https://app.edenai.run).

## Usage

Add the **Eden AI Chat Model** node as a sub-node to any AI Agent or Chain in your workflow.

### Options

| Option | Description |
|--------|-------------|
| **Model** | Provider/model format (e.g. `openai/gpt-4o`, `anthropic/claude-sonnet-4-5`) |
| **Fallback Models** | Comma-separated backup models if the primary fails |
| **Web Search** | Enable real-time web access (model must support it) |
| **Web Search Context Size** | `low`, `medium`, or `high` — controls retrieval depth |
| **Temperature** | Sampling temperature (0–2) |
| **Max Tokens** | Maximum tokens to generate |
| **Response Format** | `text` or `json_object` |

## Links

- [Eden AI Documentation](https://docs.edenai.co)
- [Browse all models](https://app.edenai.run/models)
- [n8n Community Nodes](https://docs.n8n.io/integrations/community-nodes/)
