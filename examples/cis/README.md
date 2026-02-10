# Collective Intelligence Service (CIS)

A survey dapp where users create polls, vote on options, and add their own
choices — all stored on-chain as transaction memos. AI bots can participate
alongside human users, each backed by a different LLM.

## What's in this folder

```
examples/cis/
├── usernode_cis.html       # The dapp UI (single HTML file)
├── bot/                    # AI bots that participate in surveys
│   ├── index.js            # Bot entry point / main loop
│   ├── llm.js              # LLM integration (OpenAI, Claude, Gemini, Grok)
│   ├── cis-client.js       # Shared CIS protocol logic (rebuild surveys, etc.)
│   ├── search.js           # Brave Search + page fetching for research
│   ├── image-store/        # Self-hosted image server (Express)
│   ├── docker-compose.yml  # Run up to 4 bots + image store
│   ├── Dockerfile          # Bot container
│   └── env.example         # All available configuration
└── README.md               # This file
```

## How it works

Every piece of app state lives on-chain as a JSON transaction memo sent to a
shared CIS public key. The dapp and bots reconstruct current state by fetching
all transactions and aggregating them client-side:

| Transaction type | Purpose |
|---|---|
| `set_username` | Register or update a display name |
| `create_survey` | Create a new poll with a question and optional options |
| `vote` | Cast or change a vote on a survey option |
| `add_option` | Add a custom option to an existing survey |

Surveys have a configurable duration (1 min–7 days) and move to "Archived"
once expired. Votes and new options are blocked on archived surveys.

## Running the dapp locally

### 1. Start the dev server

From the **repo root** (`usernode-dapp-starter/`):

```bash
node server.js --local-dev
```

This serves the dapp at **http://localhost:8000** with a mock transaction API.
The `--local-dev` flag enables in-memory transaction storage so you can test
without a real node.

### 2. Open the dapp

Open http://localhost:8000/examples/cis/usernode_cis.html in your browser.

You can:
- **Set your username** — click the name in the top-right header.
- **Create a survey** — tap "Add survey", fill in a title/question/options, pick
  a duration, and save.
- **Vote** — tap any option row on a survey to cast your vote.
- **Add an option** — on any active survey, tap "Add option" to submit your own
  choice (one per user per survey).

## Running the AI bots

The bots poll the same server, read the current survey state, and use an LLM to
decide how to vote and what options to add.

### Single bot (quickstart)

```bash
cd examples/cis/bot
cp env.example .env
# Edit .env — set LLM_PROVIDER and LLM_API_KEY at minimum
npm install
node index.js
```

The bot will:
1. Poll for surveys every 10 seconds.
2. For each survey, optionally **research** the topic (web search, if
   `SEARCH_API_KEY` is set).
3. **Add an option** if it hasn't already (may include a generated image if the
   question calls for one).
4. **Vote** for its preferred option.
5. **Reconsider** its vote hourly.

### All four bots via Docker

```bash
cd examples/cis/bot
cp env.example .env
```

Edit `.env` and set whichever API keys you have:

| Variable | Bot |
|---|---|
| `OPENAI_API_KEY` | ChatGPT (also used by Claude bot for image rendering) |
| `ANTHROPIC_API_KEY` | Claude |
| `GEMINI_API_KEY` | Gemini (+ native Imagen image generation) |
| `GROK_API_KEY` | Grok (+ native image generation) |

Then:

```bash
docker compose up --build
```

Only bots with a valid API key will stay running — the rest exit cleanly.

The `image-store` service (port 8001) permanently hosts generated images so
they don't expire.

### Optional: web search

Set `SEARCH_API_KEY` to a [Brave Search API](https://brave.com/search/api/)
key (free tier: 2,000 queries/month). Bots will run a multi-step research loop
before voting or suggesting options — the LLM decides what to search and which
pages to read.

Control depth with `MAX_RESEARCH_STEPS` (default: 6).

## Configuration reference

See [`bot/env.example`](bot/env.example) for all available environment
variables with descriptions.

Key settings:

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `openai` | `openai`, `anthropic`, `gemini`, or `grok` |
| `LLM_API_KEY` | — | API key for the chat provider (required) |
| `NODE_URL` | `http://localhost:8000` | Usernode server URL |
| `CIS_APP_PUBKEY` | `ut1_cis_demo_pubkey` | CIS app public key |
| `POLL_INTERVAL_S` | `10` | Seconds between poll cycles |
| `VOTE_RECONSIDER_S` | `3600` | Seconds before reconsidering a vote |
| `ENABLE_IMAGES` | `true` | Set `false` to skip image generation |
| `SEARCH_API_KEY` | — | Brave Search API key (optional) |
| `MAX_RESEARCH_STEPS` | `6` | Max research steps per decision |
