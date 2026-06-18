# n8n-nodes-edenai

This is an n8n community node for [Eden AI](https://www.edenai.co) — a European AI gateway that gives you access to 300+ models from 50+ providers through a single API and credential.

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

This package provides three nodes:

- **Eden AI Chat Model** — language-model sub-node for AI Agents and Chains
- **Eden AI Embeddings** — embeddings sub-node for vector stores and retrievers
- **Eden AI Expert Models** — action node for non-LLM features (OCR, text, image, audio, translation)

### Eden AI Chat Model

Add the **Eden AI Chat Model** node as a sub-node to any AI Agent or Chain in your workflow.

#### Options

| Option | Description |
|--------|-------------|
| **Model** | Provider/model format (e.g. `openai/gpt-4o`, `anthropic/claude-sonnet-4-5`) |
| **Fallback Models** | Comma-separated backup models if the primary fails |
| **Web Search** | Enable real-time web access (model must support it) |
| **Web Search Context Size** | `low`, `medium`, or `high` — controls retrieval depth |
| **Temperature** | Sampling temperature (0–2) |
| **Max Tokens** | Maximum tokens to generate |
| **Response Format** | `text` or `json_object` |

### Eden AI Expert Models

The **Eden AI Expert Models** node runs Eden AI's non-LLM features through the Universal AI endpoint. Unlike the Chat Model and Embeddings sub-nodes, it's a regular action node — connect it inline in a workflow.

Pick a **Feature**, **Subfeature**, and **Provider** (loaded live from your account), set the **Input Type** to Text or File (a public URL, an uploaded file ID, or binary data from a previous node), and add any extra parameters (e.g. `target_language`, `voice`, `document_type`) under **Additional Input Fields**. Toggle **EU Only** to route through `api.eu.edenai.run` and list only EU-eligible providers (GDPR / data residency).

Other **Options**:

| Option | Default | Purpose |
| --- | --- | --- |
| **Fallback Models** | — | Comma-separated providers (up to 3) tried in order if the primary fails. |
| **Provider Params** | `{}` | Provider-specific parameters sent as `provider_params`; takes precedence over the normalized input fields. |
| **Simplify Response** | `false` | Return only the feature `output` instead of the full envelope (status, cost, provider, output). |
| **Show Original Response** | `false` | Include the raw provider response under `original_response`. |
| **Download File Output** | `false` | Download generated files (image generation, text-to-speech, document translation) and attach as binary data under **Output Binary Field** (default `data`). |

**Asynchronous features** — speech-to-text, multi-page OCR (`ocr_async`, `ocr_tables_async`), and video generation — are supported and labelled **(async)** in the Subfeature list. By default the node launches the job and polls until it finishes. Control this under **Options**:

| Option | Default | Purpose |
| --- | --- | --- |
| **Wait for Completion** | `true` | Poll until the job finishes and return its result. Turn off to return the job handle (`public_id`) immediately and poll it yourself or receive a webhook. |
| **Poll Interval (Ms)** | `4000` | Delay between job status checks while waiting. |
| **Max Wait Time (Ms)** | `300000` | How long to poll before timing out. |
| **Webhook URL** | — | A URL Eden AI calls when the job completes (sent as `webhook_receiver`). |

This node is also exposed as an **AI tool** (`usableAsTool`), so an AI Agent can call Eden AI expert models directly.

## Links

- [Eden AI Documentation](https://edenai.co/docs)
- [Browse all models](https://app.edenai.run/models)
- [n8n Community Nodes](https://docs.n8n.io/integrations/community-nodes/)
