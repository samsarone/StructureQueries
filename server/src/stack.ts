import { env } from "./config/env.js";
import {
  elevenLabsAdapter,
  mongoDbAdapter,
  mongooseAdapter,
  samsarAdapter
} from "./adapters/index.js";
import {
  elevenLabsConnector,
  mongoDbConnector,
  mongooseConnector,
  samsarConnector
} from "./connectors/index.js";

export const backendConnectors = {
  elevenLabs: elevenLabsConnector,
  mongodb: mongoDbConnector,
  mongoose: mongooseConnector,
  samsar: samsarConnector
} as const;

export const backendAdapters = {
  elevenLabs: elevenLabsAdapter,
  mongodb: mongoDbAdapter,
  mongoose: mongooseAdapter,
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
    },
    {
      id: "mongodb",
      category: "database",
      runtime: "sdk",
      packageName: "mongodb",
      connector: "mongoDbConnector",
      adapter: "mongoDbAdapter",
      configured: mongoDbConnector.isConfigured(),
      env: {
        required: [],
        optional: []
      },
      notes: "Foundation connector only. The current proxy runtime does not use MongoDB."
    },
    {
      id: "mongoose",
      category: "odm",
      runtime: "sdk",
      packageName: "mongoose",
      connector: "mongooseConnector",
      adapter: "mongooseAdapter",
      configured: mongooseConnector.isConfigured(),
      env: {
        required: [],
        optional: []
      },
      notes: "Foundation connector only. The current proxy runtime does not use Mongoose."
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
