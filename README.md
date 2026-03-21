# StructuredQueries

Monorepo scaffold with:

- `client/`: Chrome extension (Manifest V3) built with TypeScript + esbuild
- `server/`: Node.js API built with TypeScript + Express

## Quick start

```bash
npm install
npm run dev:server
```

In a second terminal:

```bash
npm run dev:client
```

Then load the unpacked extension from `client/dist` in Chrome.

## Structure

```text
client/
  public/        Static extension assets such as manifest and popup HTML
  scripts/       Build/watch tooling for the extension
  src/           Popup, background service worker, and content script
server/
  src/           Express app, config, and routes
```

## Backend stack

The server workspace now includes typed connectors and adapters for:

- ElevenLabs via `@elevenlabs/elevenlabs-js`
- Samsar via `samsar-js`
- Firecrawl via `firecrawl-cli`
- MongoDB via `mongodb`
- Mongoose via `mongoose`

Key backend entry points:

- `server/src/connectors/`: raw client/connection factories
- `server/src/adapters/`: higher-level wrappers to build new routes/services on top of
- `server/src/stack.ts`: backend registry/manifest
- `GET /api/stack`: runtime-visible stack manifest and configuration status
- `POST /api/browser-sessions`: stateless browser-session sync
- `POST /api/browser-sessions/register`: explicit external-user registration for the extension install flow
- `POST /api/chat-completion`: proxy chat endpoint with Samsar-backed RAG and multimodal response metadata
- `POST /v1/chat/completions`: OpenAI-compatible text completion surface over the same grounded backend flow

The proxy is stateless. The extension stores the returned `externalUserApiKey`, `assistantSessionId`, and page `templateId` locally, while external-user identity and assistant session state live in Samsar.

MongoDB and Mongoose remain available as foundation connectors, but the current proxy flow does not require any Mongo credentials or proxy-side persistence.

Copy the values you need from `server/.env.example` into your local server env before using the provider adapters.
