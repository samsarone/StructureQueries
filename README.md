# Structure Queries

Monorepo scaffold for Structure Queries with:

- `client/`: Chrome extension (Manifest V3) built with TypeScript + esbuild
- `client/public/`: public web client assets served by the backend at `/web-client`
- `server/`: Node.js API built with TypeScript + Express

## Quick start

```bash
npm install
npm run dev:server
```

In a second terminal:

```bash
STRUCTUREDQUERIES_SERVER_ORIGIN=http://localhost:3000 npm run dev:client
```

Then:

- open the public web client at `http://localhost:3000/web-client`
- load the unpacked extension from `client/dist` in Chrome

The extension build defaults to `https://structurequeries.samsar.one`.
Set `STRUCTUREDQUERIES_SERVER_ORIGIN` before building or watching the client if you want a different backend origin, for example:

```bash
STRUCTUREDQUERIES_SERVER_ORIGIN=http://localhost:3000 npm run dev:client
```

For a production build:

```bash
STRUCTUREDQUERIES_SERVER_ORIGIN=https://structurequeries.samsar.one npm run build:client
```

## Structure

```text
client/
  public/        Static extension assets such as manifest and popup HTML
  scripts/       Build/watch tooling for the extension
  src/           Popup, background service worker, and content script
server/
  src/           Express app, config, routes, connectors, and adapters
```

## Workspace dependencies

### Root workspace

- npm workspaces for `client` and `server`
- scripts:
  - `npm run dev:server`
  - `npm run dev:client`
  - `npm run build`
  - `npm run check`

### Client workspace

The extension workspace currently uses:

- `@types/chrome` `^0.1.38`
- `chokidar` `^4.0.3`
- `esbuild` `^0.27.4`
- `typescript` `^5.9.3`

Runtime notes:

- the extension is bundled for `chrome120`
- the public web client is plain static HTML/CSS/JS under `client/public`
- the public web client is served by the backend and does not have a separate package manifest

### Server workspace

The server workspace currently uses:

- `@elevenlabs/elevenlabs-js` `^2.39.0`
- `@mendable/firecrawl-js` `^4.16.0`
- `cors` `^2.8.6`
- `dotenv` `^17.3.1`
- `express` `^5.2.1`
- `mongodb` `^6.21.0`
- `mongoose` `^8.23.0`
- `samsar-js` `^0.48.12`
- `ws` `^8.19.0`

Server development dependencies:

- `@types/cors` `^2.8.19`
- `@types/express` `^5.0.6`
- `@types/node` `^25.5.0`
- `@types/ws` `^8.18.1`
- `tsx` `^4.21.0`
- `typescript` `^5.9.3`

## Local development

Copy `server/.env.example` to `server/.env` and fill in the integrations you want to use.

Minimum local server env:

```bash
PORT=3000
SAMSAR_API_KEY=your_samsar_api_key
FIRECRAWL_API_KEY=your_firecrawl_api_key
```

Optional server env already supported by the current code:

```bash
NODE_ENV=development
DOTENV_CONFIG_PATH=

ELEVENLABS_API_KEY=
ELEVENLABS_DEFAULT_VOICE_ID=
SAMSAR_PUBLIC_API_BASE_URL=https://api.samsar.one
APP_NAME=test
CURRENT_ENV=development

FIRECRAWL_API_URL=https://api.firecrawl.dev
FIRECRAWL_CRAWL_LEVELS=2
FIRECRAWL_MAX_LINKS=5
FIRECRAWL_POLL_INTERVAL_SECONDS=5
FIRECRAWL_TIMEOUT_SECONDS=120

MONGODB_URI=
MONGODB_DATABASE=
MONGODB_APP_NAME=
MONGOOSE_AUTO_INDEX=
```

Firecrawl local/self-hosted note:

- the server uses `@mendable/firecrawl-js`
- by default it targets `https://api.firecrawl.dev`
- if you run Firecrawl locally, set `FIRECRAWL_API_URL` to your local Firecrawl base URL and set `FIRECRAWL_API_KEY` to the key expected by that instance
- webpage analysis endpoints require both `FIRECRAWL_API_KEY` and `SAMSAR_API_KEY`

## Clients and local URLs

### Chrome extension client

- build output: `client/dist`
- default local backend origin: `http://localhost:3000` when you set `STRUCTUREDQUERIES_SERVER_ORIGIN=http://localhost:3000`
- main flows use:
  - `POST /api/browser-sessions`
  - `POST /api/browser-sessions/register`
  - `POST /api/chat-completion`
  - `GET /api/webpages/status`
  - `POST /api/webpages/analyze`

### Public web client

- served by the backend at `GET /web-client`
- static assets come from `client/public`
- websocket gateway: `/ws/plugin`
- the public client uses the same analysis and session APIs as the extension

## Backend stack

The server workspace now includes typed connectors and adapters for:

- ElevenLabs via `@elevenlabs/elevenlabs-js`
- Firecrawl via `@mendable/firecrawl-js`
- Samsar via `samsar-js`
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
- `GET /api/webpages/status`: webpage embedding status lookup
- `POST /api/webpages/analyze`: Firecrawl-backed webpage analysis and embedding ingestion
- `POST /v1/chat/completions`: OpenAI-compatible text completion surface over the same grounded backend flow

The proxy is stateless. The extension stores the returned `externalUserApiKey`, `assistantSessionId`, and page `templateId` locally, while external-user identity and assistant session state live in Samsar.

MongoDB and Mongoose remain available as foundation connectors, but the current proxy flow does not require any Mongo credentials or proxy-side persistence.

Copy the values you need from `server/.env.example` into your local server env before using the provider adapters.
