import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadDotenv } from "dotenv";

const dotenvPath =
  process.env.DOTENV_CONFIG_PATH ??
  [".env", ".env.production"].find((candidate) =>
    existsSync(resolve(process.cwd(), candidate))
  );

if (dotenvPath) {
  loadDotenv({
    path: dotenvPath
  });
}

const DEFAULT_PORT = 3000;
const DEFAULT_SERVICE_NAME = "structuredqueries-server";
const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";
const DEFAULT_TIMEOUT_SECONDS = 60;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_SAMSAR_ASSISTANT_MAX_OUTPUT_TOKENS = 500;
const DEFAULT_SAMSAR_ASSISTANT_IMAGE_SIZE = "1024x1024";
const DEFAULT_SAMSAR_RETRIEVAL_LIMIT = 6;
const DEFAULT_SAMSAR_SIMILARITY_LIMIT = 8;
const DEFAULT_SAMSAR_EXTERNAL_USER_PROVIDER = "structuredqueries";
const DEFAULT_SAMSAR_EXTERNAL_ASSISTANT_PROMPT_VERSION =
  "structuredqueries-rag-voice-v1";
const DEFAULT_FIRECRAWL_API_URL = "https://api.firecrawl.dev";
const DEFAULT_FIRECRAWL_CRAWL_LEVELS = 2;
const DEFAULT_FIRECRAWL_MAX_LINKS = 5;
const DEFAULT_FIRECRAWL_POLL_INTERVAL_SECONDS = 5;
const DEFAULT_FIRECRAWL_TIMEOUT_SECONDS = 120;

function parsePort(value: string | undefined) {
  const parsed = Number(value ?? DEFAULT_PORT);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return DEFAULT_PORT;
  }

  return parsed;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  options?: {
    min?: number;
    max?: number;
  }
) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  const min = options?.min ?? 1;
  const max = options?.max ?? Number.MAX_SAFE_INTEGER;

  if (parsed < min || parsed > max) {
    return fallback;
  }

  return parsed;
}

function readOptional(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

export const env = {
  appName: readOptional(process.env.APP_NAME),
  currentEnv: readOptional(process.env.CURRENT_ENV) ?? "development",
  nodeEnv: process.env.NODE_ENV ?? "development",
  serviceName: DEFAULT_SERVICE_NAME,
  port: parsePort(process.env.PORT),
  clientOrigin: "*",
  integrations: {
    elevenLabs: {
      apiKey: readOptional(process.env.ELEVENLABS_API_KEY),
      defaultVoiceId: readOptional(process.env.ELEVENLABS_DEFAULT_VOICE_ID),
      defaultModelId: DEFAULT_ELEVENLABS_MODEL_ID,
      timeoutSeconds: DEFAULT_TIMEOUT_SECONDS
    },
    firecrawl: {
      apiKey: readOptional(process.env.FIRECRAWL_API_KEY),
      apiUrl: readOptional(process.env.FIRECRAWL_API_URL) ?? DEFAULT_FIRECRAWL_API_URL,
      crawlLevels: parsePositiveInteger(
        process.env.FIRECRAWL_CRAWL_LEVELS,
        DEFAULT_FIRECRAWL_CRAWL_LEVELS,
        {
          min: 1,
          max: 3
        }
      ),
      maxLinks: parsePositiveInteger(
        process.env.FIRECRAWL_MAX_LINKS,
        DEFAULT_FIRECRAWL_MAX_LINKS,
        {
          min: 1,
          max: DEFAULT_FIRECRAWL_MAX_LINKS
        }
      ),
      pollIntervalSeconds: parsePositiveInteger(
        process.env.FIRECRAWL_POLL_INTERVAL_SECONDS,
        DEFAULT_FIRECRAWL_POLL_INTERVAL_SECONDS
      ),
      timeoutSeconds: parsePositiveInteger(
        process.env.FIRECRAWL_TIMEOUT_SECONDS,
        DEFAULT_FIRECRAWL_TIMEOUT_SECONDS
      )
    },
    samsar: {
      apiKey: readOptional(process.env.SAMSAR_API_KEY),
      timeoutMs: DEFAULT_TIMEOUT_MS,
      assistantModel: undefined,
      assistantReasoningEffort: "medium",
      assistantMaxOutputTokens: DEFAULT_SAMSAR_ASSISTANT_MAX_OUTPUT_TOKENS,
      assistantImageSize: DEFAULT_SAMSAR_ASSISTANT_IMAGE_SIZE,
      imageToolEnabled: true,
      rerankResults: true,
      retrievalLimit: DEFAULT_SAMSAR_RETRIEVAL_LIMIT,
      similarityLimit: DEFAULT_SAMSAR_SIMILARITY_LIMIT,
      externalUserProvider: DEFAULT_SAMSAR_EXTERNAL_USER_PROVIDER,
      externalAppId: DEFAULT_SERVICE_NAME,
      externalCompanyId: undefined,
      externalAssistantPromptVersion:
        DEFAULT_SAMSAR_EXTERNAL_ASSISTANT_PROMPT_VERSION
    }
  }
};
