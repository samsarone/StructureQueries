import { env } from "./config/env.js";
import {
  elevenLabsAdapter,
  samsarAdapter
} from "./adapters/index.js";
import {
  elevenLabsConnector,
  samsarConnector
} from "./connectors/index.js";

export const backendConnectors = {
  elevenLabs: elevenLabsConnector,
  samsar: samsarConnector
} as const;

export const backendAdapters = {
  elevenLabs: elevenLabsAdapter,
  samsar: samsarAdapter
} as const;

export const backendStack = {
  adapters: backendAdapters,
  connectors: backendConnectors
} as const;

export function getStackManifest() {
  const integrations = [
    {
      id: "elevenlabs",
      category: "speech",
      runtime: "sdk",
      packageName: "@elevenlabs/elevenlabs-js",
      connector: "elevenLabsConnector",
      adapter: "elevenLabsAdapter",
      configured: elevenLabsConnector.isConfigured(),
      env: {
        required: ["ELEVENLABS_API_KEY"],
        optional: ["ELEVENLABS_DEFAULT_VOICE_ID"]
      }
    },
    {
      id: "firecrawl",
      category: "web-crawl-and-ingest",
      runtime: "sdk",
      packageName: "@mendable/firecrawl-js",
      configured: Boolean(env.integrations.firecrawl.apiKey),
      env: {
        required: ["FIRECRAWL_API_KEY"],
        optional: [
          "FIRECRAWL_API_URL",
          "FIRECRAWL_CRAWL_LEVELS",
          "FIRECRAWL_MAX_LINKS",
          "FIRECRAWL_POLL_INTERVAL_SECONDS",
          "FIRECRAWL_TIMEOUT_SECONDS"
        ]
      },
      notes:
        "Used directly by webpage analysis routes. It is not currently exposed through the connector/adapter registry."
    },
    {
      id: "samsar",
      category: "video-and-embeddings",
      runtime: "sdk",
      packageName: "samsar-js",
      connector: "samsarConnector",
      adapter: "samsarAdapter",
      configured: samsarConnector.isConfigured(),
      env: {
        required: ["SAMSAR_API_KEY"],
        optional: []
      }
    }
  ] as const;

  const configuredIntegrations = integrations.filter(
    (integration) => integration.configured
  ).length;

  return {
    service: env.serviceName,
    runtime: {
      node: process.version,
      environment: env.nodeEnv
    },
    endpoints: {
      browserSessions: "/api/browser-sessions",
      browserSessionRegistration: "/api/browser-sessions/register",
      chatCompletion: "/api/chat-completion",
      health: "/api/health",
      messages: "/api/messages",
      stack: "/api/stack",
      voices: "/api/voices",
      webpages: "/api/webpages",
      openAiCompatibleChatCompletions: "/v1/chat/completions",
      websocketGateway: "/ws/plugin"
    },
    summary: {
      totalIntegrations: integrations.length,
      configuredIntegrations
    },
    integrations
  };
}

export function getStackSummary() {
  return getStackManifest().summary;
}
